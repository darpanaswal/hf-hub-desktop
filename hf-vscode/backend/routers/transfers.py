import asyncio
import json
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from state import transfer_manager

router = APIRouter()


@router.get("/")
async def list_transfers():
    return {"transfers": transfer_manager.all()}


@router.get("/active")
async def list_active():
    return {"transfers": transfer_manager.active()}


@router.get("/stream/events")
async def stream_events():
    """SSE endpoint — pushes transfer snapshots and updates to the client."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    transfer_manager.subscribe(queue)

    async def event_generator():
        try:
            # Send full snapshot immediately on connect
            all_transfers = transfer_manager.all()
            yield f"data: {json.dumps({'type': 'snapshot', 'transfers': all_transfers})}\n\n"

            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    # Normalise event/type field name
                    event = msg.get("event") or msg.get("type", "update")
                    if event == "snapshot":
                        yield f"data: {json.dumps({'type': 'snapshot', 'transfers': msg['transfers']})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'update', 'transfer': msg['transfer']})}\n\n"
                except asyncio.TimeoutError:
                    yield "data: {\"type\": \"ping\"}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            transfer_manager.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.delete("/history")
async def clear_history(transfer_type: Optional[str] = Query(None)):
    """Clear completed/error/cancelled transfers, optionally filtered by 'upload' or 'download'."""
    transfer_manager.clear_history(transfer_type=transfer_type)
    return {"success": True}


@router.get("/{transfer_id}")
async def get_transfer(transfer_id: str):
    t = transfer_manager.get(transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return t.to_dict()


@router.delete("/{transfer_id}")
async def cancel_or_remove_transfer(transfer_id: str, remove: bool = False):
    """
    Cancel an active transfer OR remove a finished one from history.
    Pass ?remove=true to delete a completed/error/cancelled entry.
    """
    t = transfer_manager.get(transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")

    from state import TERMINAL_STATUSES, TransferStatus
    is_terminal = t.status in TERMINAL_STATUSES

    if is_terminal or remove:
        # Just remove from history
        transfer_manager.remove(transfer_id)
        return {"success": True, "action": "removed"}

    # Active/queued — cancel it
    if t.type == "upload":
        try:
            from routers.uploads import _upload_cancel_events
            event = _upload_cancel_events.get(transfer_id)
            if event:
                event.set()
        except Exception:
            pass

    transfer_manager.cancel(transfer_id)
    return {"success": True, "action": "cancelled"}


@router.delete("/{transfer_id}/remove")
async def remove_transfer(transfer_id: str):
    """Permanently remove a single finished transfer from history."""
    t = transfer_manager.get(transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    from state import TERMINAL_STATUSES, TransferStatus
    if t.status not in TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail="Can only remove finished transfers. Cancel first.")
    transfer_manager.remove(transfer_id)
    return {"success": True}
