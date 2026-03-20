from fastapi import APIRouter, HTTPException
from state import get_token

router = APIRouter()


def _api():
    from huggingface_hub import HfApi
    return HfApi(token=get_token())


@router.get("/")
async def my_repos():
    from state import get_token as gt
    token = gt()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        api = _api()
        info = api.whoami()
        username = info.get("name")

        models = list(api.list_models(author=username, limit=100, expand=["downloads", "likes", "lastModified", "private", "pipeline_tag", "tags"]))
        datasets = list(api.list_datasets(author=username, limit=100, expand=["downloads", "likes", "lastModified", "private", "tags"]))
        spaces = list(api.list_spaces(author=username, limit=50, expand=["likes", "lastModified", "private", "sdk", "tags"]))

        def model_dict(m):
            return {
                "id": m.id, "type": "model",
                "private": getattr(m, "private", False),
                "downloads": getattr(m, "downloads", 0) or 0,
                "likes": getattr(m, "likes", 0) or 0,
                "pipeline_tag": getattr(m, "pipeline_tag", None),
                "last_modified": str(getattr(m, "last_modified", "") or ""),
                "tags": list(getattr(m, "tags", None) or [])[:6],
            }
        def dataset_dict(d):
            return {
                "id": d.id, "type": "dataset",
                "private": getattr(d, "private", False),
                "downloads": getattr(d, "downloads", 0) or 0,
                "likes": getattr(d, "likes", 0) or 0,
                "last_modified": str(getattr(d, "last_modified", "") or ""),
                "tags": list(getattr(d, "tags", None) or [])[:6],
            }
        def space_dict(s):
            return {
                "id": s.id, "type": "space",
                "private": getattr(s, "private", False),
                "likes": getattr(s, "likes", 0) or 0,
                "sdk": getattr(s, "sdk", None),
                "last_modified": str(getattr(s, "last_modified", "") or ""),
            }

        return {
            "username": username,
            "models": [model_dict(m) for m in models],
            "datasets": [dataset_dict(d) for d in datasets],
            "spaces": [space_dict(s) for s in spaces],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_my_repos_flat():
    """Returns flat list of repo IDs for the upload picker dropdown."""
    from state import get_token as gt
    token = gt()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        api = _api()
        info = api.whoami()
        username = info.get("name")

        results = []
        for m in api.list_models(author=username, limit=200, expand=["private", "pipeline_tag"]):
            results.append({"id": m.id, "type": "model", "private": getattr(m, "private", False)})
        for d in api.list_datasets(author=username, limit=200, expand=["private"]):
            results.append({"id": d.id, "type": "dataset", "private": getattr(d, "private", False)})
        for s in api.list_spaces(author=username, limit=100, expand=["private"]):
            results.append({"id": s.id, "type": "space", "private": getattr(s, "private", False)})

        return {"repos": results, "username": username}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
