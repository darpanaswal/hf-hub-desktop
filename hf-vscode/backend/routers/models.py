from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from state import get_token

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


EXPAND_FIELDS = [
    "author", "downloads", "likes", "pipeline_tag",
    "library_name", "lastModified", "private", "tags",
]


@router.get("/search")
async def search_models(
    q: Optional[str] = Query(None),
    task: Optional[str] = Query(None),
    library: Optional[str] = Query(None),
    limit: int = Query(20, le=100),
):
    try:
        api = _api()
        kwargs = dict(
            search=q or None,
            pipeline_tag=task or None,
            limit=limit,
            sort="downloads",
            cardData=False,
            fetch_config=False,
            expand=EXPAND_FIELDS,
        )
        if library:
            kwargs["filter"] = library

        results = api.list_models(**kwargs)
        models = []
        for m in results:
            models.append({
                "id": m.id,
                "author": getattr(m, "author", None),
                "name": m.id,
                "private": getattr(m, "private", False),
                "downloads": getattr(m, "downloads", 0) or 0,
                "likes": getattr(m, "likes", 0) or 0,
                "tags": list(getattr(m, "tags", None) or [])[:10],
                "pipeline_tag": getattr(m, "pipeline_tag", None),
                "last_modified": str(getattr(m, "last_modified", "") or ""),
                "library_name": getattr(m, "library_name", None),
            })
        return {"models": models, "total": len(models)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks")
async def list_tasks():
    return {"tasks": [
        "text-generation", "text-classification", "token-classification",
        "question-answering", "summarization", "translation",
        "image-classification", "object-detection", "image-segmentation",
        "image-to-text", "text-to-image", "automatic-speech-recognition",
        "text-to-speech", "audio-classification", "fill-mask",
        "sentence-similarity", "feature-extraction", "zero-shot-classification",
        "depth-estimation", "video-classification", "reinforcement-learning",
    ]}


@router.get("/{repo_id:path}/info")
async def model_info(repo_id: str):
    try:
        api = _api()
        info = api.model_info(repo_id, files_metadata=True)
        siblings = []
        for f in (info.siblings or []):
            siblings.append({
                "filename": f.rfilename,
                "size": getattr(f, "size", None),
                "blob_id": getattr(f, "blob_id", None),
            })
        return {
            "id": info.id,
            "author": getattr(info, "author", None),
            "private": getattr(info, "private", False),
            "downloads": getattr(info, "downloads", 0) or 0,
            "likes": getattr(info, "likes", 0) or 0,
            "tags": list(getattr(info, "tags", None) or []),
            "pipeline_tag": getattr(info, "pipeline_tag", None),
            "library_name": getattr(info, "library_name", None),
            "last_modified": str(getattr(info, "last_modified", "") or ""),
            "sha": getattr(info, "sha", None),
            "siblings": siblings,
            "card_data": getattr(info, "cardData", {}),
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
