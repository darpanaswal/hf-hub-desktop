from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from state import get_token

router = APIRouter()

EXPAND_FIELDS = ["author", "likes", "lastModified", "private", "tags", "sdk", "runtime"]


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


@router.get("/search")
async def search_spaces(
    q: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
):
    try:
        api = _api()
        results = api.list_spaces(
            search=q or None,
            limit=limit,
            sort="likes",
            expand=EXPAND_FIELDS,
        )
        spaces = []
        for s in results:
            spaces.append({
                "id": s.id,
                "author": getattr(s, "author", None),
                "private": getattr(s, "private", False),
                "likes": getattr(s, "likes", 0) or 0,
                "sdk": getattr(s, "sdk", None),
                "tags": list(getattr(s, "tags", None) or [])[:8],
                "last_modified": str(getattr(s, "last_modified", "") or ""),
                "runtime": getattr(s, "runtime", None),
            })
        return {"spaces": spaces, "total": len(spaces)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
