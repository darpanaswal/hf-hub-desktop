import asyncio
import os
import time
import threading
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Callable
from state import get_token, transfer_manager, TransferType, TransferStatus

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


# ── Progress-aware tqdm patch ─────────────────────────────────────────────────
def make_progress_tqdm(on_update: Callable):
    """Returns a tqdm subclass that fires on_update(n_bytes) instead of printing."""
    from tqdm import tqdm as _base

    class _CallbackTqdm(_base):
        def __init__(self, *a, **kw):
            kw.setdefault('disable', True)
            super().__init__(*a, **kw)

        def update(self, n=1):
            super().update(n)
            try:
                on_update(n or 0)
            except Exception:
                pass

    return _CallbackTqdm


def _get_tqdm_globals():
    """
    Return the globals dict that tqdm_stream_file resolves 'tqdm' from.
    This is the ONLY reliable way to patch it — hf_utils.tqdm and tqdm_mod.tqdm
    are different references; tqdm_stream_file uses __wrapped__.__globals__['tqdm'].
    """
    from huggingface_hub.utils.tqdm import tqdm_stream_file
    fn = getattr(tqdm_stream_file, '__wrapped__', tqdm_stream_file)
    return fn.__globals__


def patched_upload(
    api,
    local_path: str,
    repo_id: str,
    repo_type: str,
    commit_message: str,
    private: bool,
    create_repo_flag: bool,
    path_in_repo: str,
    on_file_start: Callable,
    on_bytes: Callable,
    cancel_event: threading.Event,
):
    """Upload files while patching huggingface_hub's tqdm for byte-level progress."""
    patched = make_progress_tqdm(on_bytes)

    # Patch the globals dict that tqdm_stream_file actually uses at call time
    g = _get_tqdm_globals()
    original_tqdm = g.get('tqdm')
    g['tqdm'] = patched

    # Also patch hf_utils and tqdm_mod as belt-and-suspenders
    import huggingface_hub.utils as hf_utils
    orig_hf_tqdm = getattr(hf_utils, 'tqdm', None)
    if orig_hf_tqdm is not None:
        hf_utils.tqdm = patched

    try:
        if create_repo_flag:
            api.create_repo(repo_id=repo_id, repo_type=repo_type, private=private, exist_ok=True)

        base = Path(local_path)
        all_files = [base] if base.is_file() else sorted(p for p in base.rglob('*') if p.is_file())

        for filepath in all_files:
            if cancel_event.is_set():
                break
            rel  = str(filepath.relative_to(base)) if base.is_dir() else filepath.name
            dest = (path_in_repo.rstrip('/') + '/' + rel).lstrip('/') if path_in_repo else rel
            on_file_start(rel, filepath.stat().st_size)
            api.upload_file(
                path_or_fileobj=str(filepath),
                path_in_repo=dest,
                repo_id=repo_id,
                repo_type=repo_type,
                commit_message=f"{commit_message} [{rel}]",
            )
            on_bytes(0)  # flush after small files that skip LFS

    finally:
        # Restore all patches
        if original_tqdm is not None:
            g['tqdm'] = original_tqdm
        if orig_hf_tqdm is not None:
            hf_utils.tqdm = orig_hf_tqdm


# ── Request models ────────────────────────────────────────────────────────────

class UploadFolderRequest(BaseModel):
    local_path: str
    repo_id: str
    repo_type: str = "model"
    path_in_repo: str = ""
    commit_message: str = "Upload via HF Hub Desktop"
    private: bool = False
    create_repo: bool = True


class UploadFileRequest(BaseModel):
    local_path: str
    repo_id: str
    path_in_repo: str
    repo_type: str = "model"
    commit_message: str = "Upload via HF Hub Desktop"


class CreateRepoRequest(BaseModel):
    repo_id: str
    repo_type: str = "model"
    private: bool = False
    exist_ok: bool = True


# ── Cancel registry ───────────────────────────────────────────────────────────
_upload_cancel_events: dict = {}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/folder")
async def upload_folder(req: UploadFolderRequest):
    path = req.local_path
    if not os.path.exists(path):
        raise HTTPException(status_code=400, detail=f"Path not found: {path}")

    base = Path(path)
    all_files = [base] if base.is_file() else sorted(p for p in base.rglob('*') if p.is_file())
    total_bytes = sum(f.stat().st_size for f in all_files)

    transfer = transfer_manager.create(
        type=TransferType.UPLOAD,
        repo_id=req.repo_id,
        meta={"local_path": path, "repo_type": req.repo_type},
    )
    transfer_manager.update(transfer.id, total_files=len(all_files), total_bytes=total_bytes)

    cancel_event = threading.Event()
    _upload_cancel_events[transfer.id] = cancel_event

    async def _run():
        # Mutable progress state (shared between async and thread via closures)
        state = {
            "uploaded_bytes": 0,
            "current_file_bytes": 0,
            "current_file_size": 0,
            "completed_files": 0,
            "start": time.time(),
        }

        loop = asyncio.get_running_loop()

        def thread_safe_update(**kwargs):
            """Schedule transfer_manager.update onto the event loop from the thread."""
            loop.call_soon_threadsafe(
                lambda kw=kwargs: transfer_manager.update(transfer.id, **kw)
            )

        def on_file_start(name: str, size: int):
            state["current_file_bytes"] = 0
            state["current_file_size"] = size
            thread_safe_update(
                status=TransferStatus.ACTIVE,
                current_file=name,
                completed_files=state["completed_files"],
            )

        def on_bytes(delta: int):
            if delta > 0:
                state["uploaded_bytes"] += delta
                state["current_file_bytes"] += delta

            if state["current_file_size"] > 0 and state["current_file_bytes"] >= state["current_file_size"]:
                state["completed_files"] += 1
                state["current_file_bytes"] = 0

            elapsed = time.time() - state["start"]
            speed = state["uploaded_bytes"] / elapsed if elapsed > 0 else 0
            pct = 100.0 * state["uploaded_bytes"] / total_bytes if total_bytes > 0 else 0

            thread_safe_update(
                transferred_bytes=state["uploaded_bytes"],
                progress=min(pct, 99.9),
                speed_bps=speed,
                completed_files=state["completed_files"],
            )

        try:
            await loop.run_in_executor(
                None,
                lambda: patched_upload(
                    api=_api(),
                    local_path=path,
                    repo_id=req.repo_id,
                    repo_type=req.repo_type,
                    commit_message=req.commit_message,
                    private=req.private,
                    create_repo_flag=req.create_repo,
                    path_in_repo=req.path_in_repo,
                    on_file_start=on_file_start,
                    on_bytes=on_bytes,
                    cancel_event=cancel_event,
                )
            )

            if cancel_event.is_set():
                transfer_manager.update(transfer.id, status=TransferStatus.CANCELLED)
            else:
                transfer_manager.update(
                    transfer.id,
                    status=TransferStatus.COMPLETED,
                    progress=100.0,
                    transferred_bytes=total_bytes,
                    completed_files=len(all_files),
                    completed_at=time.time(),
                )
        except asyncio.CancelledError:
            cancel_event.set()
            transfer_manager.update(transfer.id, status=TransferStatus.CANCELLED)
        except Exception as e:
            transfer_manager.update(transfer.id, status=TransferStatus.ERROR, error=str(e))
        finally:
            _upload_cancel_events.pop(transfer.id, None)

    task = asyncio.create_task(_run())
    transfer_manager.register_task(transfer.id, task)
    return {"transfer_id": transfer.id, "status": "started"}


@router.post("/file")
async def upload_single_file(req: UploadFileRequest):
    if not os.path.isfile(req.local_path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.local_path}")
    return await upload_folder(UploadFolderRequest(
        local_path=req.local_path,
        repo_id=req.repo_id,
        repo_type=req.repo_type,
        path_in_repo=req.path_in_repo,
        commit_message=req.commit_message,
    ))


@router.post("/create-repo")
async def create_repo(req: CreateRepoRequest):
    try:
        api = _api()
        url = api.create_repo(
            repo_id=req.repo_id,
            repo_type=req.repo_type,
            private=req.private,
            exist_ok=req.exist_ok,
        )
        return {"success": True, "url": str(url)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/cancel/{transfer_id}")
async def cancel_upload(transfer_id: str):
    event = _upload_cancel_events.get(transfer_id)
    if event:
        event.set()
    transfer_manager.cancel(transfer_id)
    return {"success": True}
