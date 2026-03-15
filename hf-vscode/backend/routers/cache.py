import asyncio
import os
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from state import get_token, transfer_manager, TransferType, TransferStatus

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


# ── Download request ──────────────────────────────────────────────────────────

class DownloadRequest(BaseModel):
    repo_id: str
    repo_type: str = "model"
    revision: str = "main"
    local_dir: Optional[str] = None      # user-chosen parent directory
    ignore_patterns: list = []
    use_cache: bool = True               # False = download directly, delete cache after


# ── Cache scan / delete ───────────────────────────────────────────────────────

@router.get("/scan")
async def scan_cache():
    try:
        from huggingface_hub import scan_cache_dir
        cache = scan_cache_dir()
        repos = []
        for repo in cache.repos:
            revisions = []
            for rev in repo.revisions:
                revisions.append({
                    "commit_hash": rev.commit_hash,
                    "last_modified": rev.last_modified,
                    "refs": list(rev.refs),
                    "size_on_disk": rev.size_on_disk,
                    "nb_files": rev.nb_files,
                })
            repos.append({
                "repo_id": repo.repo_id,
                "repo_type": repo.repo_type,
                "repo_path": str(repo.repo_path),
                "size_on_disk": repo.size_on_disk,
                "nb_files": repo.nb_files,
                "last_accessed": repo.last_accessed,
                "last_modified": repo.last_modified,
                "revisions": revisions,
            })
        return {
            "repos": repos,
            "total_size": cache.size_on_disk,
            "total_repos": len(repos),
            "warnings": [str(w) for w in cache.warnings],
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
            "repo_type": req.repo_type,
            "revision": req.revision,
            "local_dir": req.local_dir,
            "use_cache": req.use_cache,
        },
    )

    async def _run():
        try:
            # ── Get file list for total-size estimation ──────────────────────
            api = _api()
            try:
                if req.repo_type == "model":
                    info = api.model_info(req.repo_id, files_metadata=True)
                elif req.repo_type == "dataset":
                    info = api.dataset_info(req.repo_id, files_metadata=True)
                else:
                    info = api.space_info(req.repo_id, files_metadata=True)
                siblings = info.siblings or []
                total_size = sum(getattr(f, "size", 0) or 0 for f in siblings)
                transfer_manager.update(
                    transfer.id,
                    total_files=len(siblings),
                    total_bytes=total_size,
                    status=TransferStatus.ACTIVE,
                )
            except Exception:
                transfer_manager.update(transfer.id, status=TransferStatus.ACTIVE)
                total_size = 0

            # ── Build tqdm_class that feeds progress via call_soon_threadsafe ─
            loop = asyncio.get_running_loop()
            start_time = time.time()
            state = {"downloaded": 0, "total": total_size}

            def thread_safe_update(**kwargs):
                loop.call_soon_threadsafe(
                    lambda kw=kwargs: transfer_manager.update(transfer.id, **kw)
                )

            def make_download_tqdm():
                from tqdm import tqdm as _base

                class DownloadProgressTqdm(_base):
                    def __init__(self, *a, **kw):
                        kw.setdefault('disable', True)
                        # Accumulate total as files are discovered
                        added = kw.get('total', 0) or 0
                        state["total"] = max(state["total"], state["total"] + added
                                             if state["total"] == total_size else state["total"])
                        super().__init__(*a, **kw)

                    def update(self, n=1):
                        super().update(n)
                        if n and n > 0:
                            state["downloaded"] += n
                            elapsed = time.time() - start_time
                            speed = state["downloaded"] / elapsed if elapsed > 0 else 0
                            cur_total = max(state["total"], self.total or 0)
                            pct = 100.0 * state["downloaded"] / cur_total if cur_total > 0 else 0
                            thread_safe_update(
                                transferred_bytes=state["downloaded"],
                                total_bytes=cur_total,
                                progress=min(pct, 99.9),
                                speed_bps=speed,
                            )

                    def set_description(self, desc=None, refresh=True):
                        super().set_description(desc, refresh)
                        if desc:
                            # desc is the filename being downloaded
                            thread_safe_update(current_file=desc)

                return DownloadProgressTqdm

            ProgressTqdm = make_download_tqdm()

            # ── Determine destination ────────────────────────────────────────
            # If user chose a directory:
            #   - Create a subfolder named after the repo (last component)
            #   - Download files there directly (no .cache symlinks)
            # If no directory: use default HF cache (well-managed, deduped)

            repo_name = req.repo_id.split("/")[-1]

            if req.local_dir:
                # Download directly into <local_dir>/<repo_name>/
                dest = str(Path(req.local_dir) / repo_name)
                os.makedirs(dest, exist_ok=True)
                dl_kwargs = dict(local_dir=dest)
            else:
                # Use the HF cache (default)
                dl_kwargs = {}

            kwargs = dict(
                repo_id=req.repo_id,
                repo_type=req.repo_type,
                revision=req.revision,
                token=get_token(),
                tqdm_class=ProgressTqdm,
                **dl_kwargs,
            )
            if req.ignore_patterns:
                kwargs["ignore_patterns"] = req.ignore_patterns

            download_loop = asyncio.get_running_loop()
            path = await download_loop.run_in_executor(
                None,
                lambda: __import__('huggingface_hub').snapshot_download(**kwargs)
            )

            transfer_manager.update(
                transfer.id,
                status=TransferStatus.COMPLETED,
                progress=100.0,
                transferred_bytes=state["downloaded"] or total_size,
                completed_at=time.time(),
                meta={
                    **transfer_manager.get(transfer.id).meta,
                    "local_path": str(Path(req.local_dir) / repo_name) if req.local_dir else path,
                },
            )

        except asyncio.CancelledError:
            transfer_manager.update(transfer.id, status=TransferStatus.CANCELLED)
        except Exception as e:
            transfer_manager.update(transfer.id, status=TransferStatus.ERROR, error=str(e))

    task = asyncio.create_task(_run())
    transfer_manager.register_task(transfer.id, task)
    return {"transfer_id": transfer.id, "status": "started"}
