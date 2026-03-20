from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from state import get_token

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


EXPAND_FIELDS = [
    "author", "downloads", "likes", "lastModified", "private", "tags", "cardData",
]


@router.get("/search")
async def search_datasets(
    q: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
):
    try:
        api = _api()
        results = api.list_datasets(
            search=q or None,
            limit=limit,
            sort="downloads",
            expand=EXPAND_FIELDS,
        )
        datasets = []
        for d in results:
            card = getattr(d, "cardData", None) or {}
            datasets.append({
                "id": d.id,
                "author": getattr(d, "author", None),
                "private": getattr(d, "private", False),
                "downloads": getattr(d, "downloads", 0) or 0,
                "likes": getattr(d, "likes", 0) or 0,
                "tags": list(getattr(d, "tags", None) or [])[:10],
                "last_modified": str(getattr(d, "last_modified", "") or ""),
                "description": card.get("pretty_name") or card.get("language", [""])[0] if isinstance(card, dict) else None,
            })
        return {"datasets": datasets, "total": len(datasets)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{repo_id:path}/info")
async def dataset_info(repo_id: str):
    try:
        api = _api()
        info = api.dataset_info(repo_id, files_metadata=True)
        siblings = []
        for f in (info.siblings or []):
            siblings.append({
                "filename": f.rfilename,
                "size": getattr(f, "size", None),
            })
        return {
            "id": info.id,
            "author": getattr(info, "author", None),
            "private": getattr(info, "private", False),
            "downloads": getattr(info, "downloads", 0) or 0,
            "likes": getattr(info, "likes", 0) or 0,
            "tags": list(getattr(info, "tags", None) or []),
            "last_modified": str(getattr(info, "last_modified", "") or ""),
            "sha": getattr(info, "sha", None),
            "siblings": siblings,
            "card_data": getattr(info, "cardData", {}),
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
