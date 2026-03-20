from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from state import get_token, set_token

router = APIRouter()


class TokenRequest(BaseModel):
    token: str


@router.get("/status")
async def auth_status():
    token = get_token()
    if not token:
        return {"authenticated": False, "username": None}
    try:
        from huggingface_hub import HfApi
        api = HfApi(token=token)
        info = api.whoami()
        return {
            "authenticated": True,
            "username": info.get("name"),
            "email": info.get("email"),
            "avatar_url": info.get("avatarUrl"),
            "orgs": [o.get("name") for o in info.get("orgs", [])],
        }
    except Exception as e:
        return {"authenticated": False, "username": None, "error": str(e)}


@router.post("/token")
async def set_auth_token(req: TokenRequest):
    try:
        from huggingface_hub import HfApi
        api = HfApi(token=req.token)
        info = api.whoami()
        set_token(req.token)
        return {
            "success": True,
            "username": info.get("name"),
            "email": info.get("email"),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


@router.delete("/token")
async def clear_token():
    set_token("")
    return {"success": True}
