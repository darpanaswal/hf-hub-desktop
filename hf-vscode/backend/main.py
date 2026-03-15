import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from routers import models, datasets, uploads, cache, auth, transfers, spaces, repos

app = FastAPI(title="HF Hub Desktop API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/auth",      tags=["auth"])
app.include_router(models.router,    prefix="/models",    tags=["models"])
app.include_router(datasets.router,  prefix="/datasets",  tags=["datasets"])
app.include_router(spaces.router,    prefix="/spaces",    tags=["spaces"])
app.include_router(repos.router,     prefix="/repos",     tags=["repos"])
app.include_router(uploads.router,   prefix="/uploads",   tags=["uploads"])
app.include_router(cache.router,     prefix="/cache",     tags=["cache"])
app.include_router(transfers.router, prefix="/transfers", tags=["transfers"])

@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}

if __name__ == "__main__":
    port = int(os.environ.get("HF_DESKTOP_PORT", 57891))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
