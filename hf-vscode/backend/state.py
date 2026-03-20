import asyncio
import uuid
import time
from typing import Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class TransferType(str, Enum):
    UPLOAD = "upload"
    DOWNLOAD = "download"


class TransferStatus(str, Enum):
    QUEUED = "queued"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


TERMINAL_STATUSES = {TransferStatus.COMPLETED, TransferStatus.ERROR, TransferStatus.CANCELLED}


@dataclass
class Transfer:
    id: str
    type: TransferType
    repo_id: str
    status: TransferStatus = TransferStatus.QUEUED
    progress: float = 0.0
    speed_bps: float = 0.0
    total_bytes: int = 0
    transferred_bytes: int = 0
    current_file: str = ""
    total_files: int = 0
    completed_files: int = 0
    error: Optional[str] = None
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "repo_id": self.repo_id,
            "status": self.status,
            "progress": round(self.progress, 2),
            "speed_bps": round(self.speed_bps, 0),
            "total_bytes": self.total_bytes,
            "transferred_bytes": self.transferred_bytes,
            "current_file": self.current_file,
            "total_files": self.total_files,
            "completed_files": self.completed_files,
            "error": self.error,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "meta": self.meta,
        }


class TransferManager:
    def __init__(self):
        self._transfers: Dict[str, Transfer] = {}
        self._tasks: Dict[str, asyncio.Task] = {}
        self._subscribers: list = []
        # Throttle: only send an SSE update at most every 0.25s per transfer
        self._last_notify: Dict[str, float] = {}

    def create(self, type: TransferType, repo_id: str, meta: dict = None) -> Transfer:
        t = Transfer(
            id=str(uuid.uuid4()),
            type=type,
            repo_id=repo_id,
            meta=meta or {},
        )
        self._transfers[t.id] = t
        return t

    def get(self, transfer_id: str) -> Optional[Transfer]:
        return self._transfers.get(transfer_id)

    def all(self) -> list:
        return [t.to_dict() for t in self._transfers.values()]

    def active(self) -> list:
        return [t.to_dict() for t in self._transfers.values()
                if t.status in (TransferStatus.ACTIVE, TransferStatus.QUEUED)]

    def update(self, transfer_id: str, **kwargs):
        t = self._transfers.get(transfer_id)
        if not t:
            return
        for k, v in kwargs.items():
            if hasattr(t, k):
                setattr(t, k, v)
        # Always notify immediately for status changes; throttle progress-only updates
        is_status_change = "status" in kwargs
        now = time.time()
        last = self._last_notify.get(transfer_id, 0)
        if is_status_change or (now - last) >= 0.25:
            self._last_notify[transfer_id] = now
            self._notify(t)

    def cancel(self, transfer_id: str):
        task = self._tasks.get(transfer_id)
        if task:
            task.cancel()
        t = self._transfers.get(transfer_id)
        if t:
            t.status = TransferStatus.CANCELLED
            self._notify(t)

    def remove(self, transfer_id: str):
        """Permanently remove a transfer from history."""
        self._transfers.pop(transfer_id, None)
        self._tasks.pop(transfer_id, None)
        self._last_notify.pop(transfer_id, None)
        self._notify_snapshot()

    def clear_history(self, transfer_type: Optional[str] = None):
        """Remove all terminal transfers, optionally filtered by type."""
        to_remove = [
            tid for tid, t in self._transfers.items()
            if t.status in TERMINAL_STATUSES
            and (transfer_type is None or t.type == transfer_type)
        ]
        for tid in to_remove:
            self._transfers.pop(tid, None)
            self._last_notify.pop(tid, None)
        self._notify_snapshot()

    def register_task(self, transfer_id: str, task: asyncio.Task):
        self._tasks[transfer_id] = task

    def subscribe(self, queue: asyncio.Queue):
        self._subscribers.append(queue)

    def unsubscribe(self, queue: asyncio.Queue):
        try:
            self._subscribers.remove(queue)
        except ValueError:
            pass

    def _notify(self, transfer: Transfer):
        if not self._subscribers:
            return
        msg = {"event": "update", "transfer": transfer.to_dict()}
        for q in list(self._subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                # Drop oldest item and retry — never silently lose updates
                try:
                    q.get_nowait()
                    q.put_nowait(msg)
                except Exception:
                    pass

    def _notify_snapshot(self):
        if not self._subscribers:
            return
        msg = {"event": "snapshot", "transfers": self.all()}
        for q in list(self._subscribers):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(msg)
                except Exception:
                    pass


transfer_manager = TransferManager()

_token: Optional[str] = None


def get_token() -> Optional[str]:
    global _token
    if _token:
        return _token
    import os
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")


def set_token(token: str):
    global _token
    _token = token
    import os
    os.environ["HF_TOKEN"] = token
