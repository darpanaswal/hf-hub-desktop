import asyncio
import os
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from state import get_token, transfer_manager, TransferType, TransferStatus

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


def _detect_repo_type(api, repo_id: str):
    """
    Try model → dataset → space in order.
    Returns (repo_type, info) or raises HTTPException.
    """
    from huggingface_hub.utils import RepositoryNotFoundError
    for repo_type, method in [
        ("model",   api.model_info),
        ("dataset", api.dataset_info),
        ("space",   api.space_info),
    ]:
        try:
            info = method(repo_id, files_metadata=True)
            return repo_type, info
        except RepositoryNotFoundError:
            continue
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(
        status_code=404,
        detail=f"'{repo_id}' not found as model, dataset, or space. "
               "Check the ID and make sure your token has access."
    )


# ── Request models ────────────────────────────────────────────────────────────

class DownloadRequest(BaseModel):
    repo_id: str
    revision: str = "main"
    local_dir: Optional[str] = None
    create_repo_subfolder: bool = True
    filenames: Optional[List[str]] = None   # None = full repo; list = selected files
    ignore_patterns: List[str] = []


# ── File listing ──────────────────────────────────────────────────────────────

@router.get("/files")
async def list_repo_files(repo_id: str, revision: str = "main"):
    """Auto-detect repo type and return its file list."""
    api = _api()
    repo_type, info = _detect_repo_type(api, repo_id)
    files = [
        {"filename": f.rfilename, "size": getattr(f, "size", None) or 0}
        for f in (info.siblings or [])
    ]
    return {"files": files, "total": len(files), "repo_type": repo_type}


# ── Cache scan / delete ───────────────────────────────────────────────────────

@router.get("/scan")
async def scan_cache():
    try:
        from huggingface_hub import scan_cache_dir
        cache = scan_cache_dir()
        repos = []
        for repo in cache.repos:
            repos.append({
                "repo_id":       repo.repo_id,
                "repo_type":     repo.repo_type,
                "repo_path":     str(repo.repo_path),
                "size_on_disk":  repo.size_on_disk,
                "nb_files":      repo.nb_files,
                "last_accessed": repo.last_accessed,
                "last_modified": repo.last_modified,
                "revisions": [
                    {
                        "commit_hash":  rev.commit_hash,
                        "last_modified": rev.last_modified,
                        "refs":         list(rev.refs),
                        "size_on_disk": rev.size_on_disk,
                        "nb_files":     rev.nb_files,
                    }
                    for rev in repo.revisions
                ],
            })
        return {
            "repos":       repos,
            "total_size":  cache.size_on_disk,
            "total_repos": len(repos),
            "warnings":    [str(w) for w in cache.warnings],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/repo/{repo_type}/{repo_id:path}")
async def delete_cached_repo(repo_type: str, repo_id: str):
    try:
        from huggingface_hub import scan_cache_dir
        cache = scan_cache_dir()
        hashes = [
            rev.commit_hash
            for repo in cache.repos
            for rev in repo.revisions
            if repo.repo_id == repo_id and repo.repo_type == repo_type
        ]
        if not hashes:
            raise HTTPException(status_code=404, detail="Repo not found in cache")
        strategy = cache.delete_revisions(*hashes)
        strategy.execute()
        return {"success": True, "freed_bytes": strategy.expected_freed_size}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Download ──────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_download(req: DownloadRequest):
    transfer = transfer_manager.create(
        type=TransferType.DOWNLOAD,
        repo_id=req.repo_id,
        meta={
            "revision":             req.revision,
            "local_dir":            req.local_dir,
            "create_repo_subfolder": req.create_repo_subfolder,
            "filenames":            req.filenames,
        },
    )

    async def _run():
        try:
            api = _api()

            # ── Auto-detect repo type + get file list for sizing ──────────────
            try:
                detected_type, info = _detect_repo_type(api, req.repo_id)
            except HTTPException as e:
                transfer_manager.update(transfer.id, status=TransferStatus.ERROR, error=e.detail)
                return

            transfer_manager.update(
                transfer.id,
                status=TransferStatus.ACTIVE,
                meta={**transfer_manager.get(transfer.id).meta, "repo_type": detected_type},
            )

            # ── Size / file count estimation ──────────────────────────────────
            siblings = info.siblings or [] if info else []
            if req.filenames:
                selected = set(req.filenames)
                siblings = [f for f in siblings if f.rfilename in selected]
            total_size  = sum(getattr(f, "size", 0) or 0 for f in siblings)
            total_files = len(siblings)
            transfer_manager.update(transfer.id, total_files=total_files, total_bytes=total_size)

            # ── Progress tracking ─────────────────────────────────────────────
            loop = asyncio.get_running_loop()
            start_time = time.time()
            state = {"downloaded": 0}

            def thread_safe_update(**kwargs):
                loop.call_soon_threadsafe(
                    lambda kw=kwargs: transfer_manager.update(transfer.id, **kw)
                )

            # Build a tqdm subclass whose update() fires our progress callback.
            # We must NOT call super().update() before our code because tqdm
            # with disable=True returns immediately from update() — our callback
            # must fire unconditionally.
            from tqdm import tqdm as _base_tqdm

            class ProgressTqdm(_base_tqdm):
                def __init__(self, *a, **kw):
                    kw.pop("name", None)   # hf_tqdm passes name=; base tqdm doesn't accept it
                    kw["disable"] = True   # suppress all console output
                    super().__init__(*a, **kw)

                def update(self, n=1):
                    # Fire callback FIRST, before super() which may return early on disable
                    if n and n > 0:
                        state["downloaded"] += int(n)
                        elapsed = time.time() - start_time
                        speed = state["downloaded"] / elapsed if elapsed > 0 else 0
                        cur_total = max(total_size, state["downloaded"])
                        pct = 100.0 * state["downloaded"] / cur_total if cur_total > 0 else 0
                        thread_safe_update(
                            transferred_bytes=state["downloaded"],
                            total_bytes=cur_total,
                            progress=min(pct, 99.9),
                            speed_bps=speed,
                        )
                    super().update(n)

                def set_description(self, desc=None, refresh=True):
                    if desc:
                        thread_safe_update(current_file=desc)
                    super().set_description(desc, refresh)

            # ── Destination path ──────────────────────────────────────────────
            repo_name = req.repo_id.split("/")[-1]
            if req.local_dir:
                dest = str(Path(req.local_dir) / repo_name) if req.create_repo_subfolder \
                    else req.local_dir
                os.makedirs(dest, exist_ok=True)
            else:
                dest = None   # use default HF cache

            # ── Execute download ──────────────────────────────────────────────
            import huggingface_hub as _hf

            if req.filenames:
                # Individual files — hf_hub_download per file.
                # We do NOT pass tqdm_class to hf_hub_download because it was only
                # added in huggingface_hub 0.25.0 and raises TypeError on older versions.
                # Instead we patch tqdm_stream_file.__wrapped__.__globals__['tqdm']
                # (same technique used for uploads) so progress fires on every chunk.
                def _download_files():
                    import huggingface_hub as _hf2
                    from huggingface_hub.utils.tqdm import tqdm_stream_file

                    # Patch the module-level tqdm name that tqdm_stream_file resolves
                    fn = getattr(tqdm_stream_file, '__wrapped__', tqdm_stream_file)
                    g = fn.__globals__
                    original_tqdm = g.get('tqdm')
                    g['tqdm'] = ProgressTqdm

                    try:
                        paths = []
                        for i, filename in enumerate(req.filenames):
                            thread_safe_update(current_file=filename, completed_files=i)
                            p = _hf2.hf_hub_download(
                                repo_id=req.repo_id,
                                filename=filename,
                                repo_type=detected_type,
                                revision=req.revision,
                                local_dir=dest,
                                token=get_token(),
                            )
                            paths.append(p)
                        return paths
                    finally:
                        if original_tqdm is not None:
                            g['tqdm'] = original_tqdm

                paths = await loop.run_in_executor(None, _download_files)
                final_path = dest or (str(Path(paths[0]).parent) if paths else dest)

            else:
                # Full repo snapshot — patches tqdm globally for progress
                # Full repo snapshot — patch tqdm globally so progress fires
                # on every downloaded chunk regardless of huggingface_hub version
                from huggingface_hub.utils.tqdm import tqdm_stream_file as _tsf
                _fn = getattr(_tsf, '__wrapped__', _tsf)
                _g = _fn.__globals__
                _orig_tqdm = _g.get('tqdm')
                _g['tqdm'] = ProgressTqdm

                kwargs = dict(
                    repo_id=req.repo_id,
                    repo_type=detected_type,
                    revision=req.revision,
                    token=get_token(),
                )
                if dest:
                    kwargs["local_dir"] = dest
                if req.ignore_patterns:
                    kwargs["ignore_patterns"] = req.ignore_patterns

                try:
                    final_path = await loop.run_in_executor(
                        None, lambda: _hf.snapshot_download(**kwargs)
                    )
                finally:
                    if _orig_tqdm is not None:
                        _g['tqdm'] = _orig_tqdm

            transfer_manager.update(
                transfer.id,
                status=TransferStatus.COMPLETED,
                progress=100.0,
                transferred_bytes=state["downloaded"] or total_size,
                completed_at=time.time(),
                meta={
                    **transfer_manager.get(transfer.id).meta,
                    "local_path": dest or final_path,
                },
            )

        except asyncio.CancelledError:
            transfer_manager.update(transfer.id, status=TransferStatus.CANCELLED)
        except Exception as e:
            transfer_manager.update(transfer.id, status=TransferStatus.ERROR, error=str(e))

    task = asyncio.create_task(_run())
    transfer_manager.register_task(transfer.id, task)
    return {"transfer_id": transfer.id, "status": "started"}
