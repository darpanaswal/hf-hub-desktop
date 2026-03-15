# HF Hub Desktop

A GUI for [Hugging Face Hub](https://huggingface.co) — browse, download, and upload models and datasets without writing code.

Comes as two things:
- **Desktop app** — Electron + React, runs on macOS / Linux / Windows
- **VS Code extension** — works fully over SSH and on HPC clusters, no desktop required

> Not affiliated with Hugging Face. Built on top of the official [`huggingface_hub`](https://github.com/huggingface/huggingface_hub) Python library (Apache 2.0).

---

## Features

| Feature | Desktop | VS Code |
|---------|:-------:|:-------:|
| Search models & datasets | ✓ | ✓ |
| Download with save-location picker | ✓ | ✓ |
| Upload folder/file with real-time progress | ✓ | ✓ |
| Existing-repo picker for uploads | ✓ | ✓ |
| Upload size limit warnings | ✓ | ✓ |
| Transfer queue with cancel / remove | ✓ | ✓ |
| Per-transfer log panel | ✓ | ✓ |
| Cache manager (scan / delete) | ✓ | ✓ |
| My Repos (models / datasets / spaces) | ✓ | — |
| Spaces browser | ✓ | — |
| Works over SSH / HPC cluster | — | ✓ |
| One-click backend setup | — | ✓ |

---

## Architecture

Both apps share the same Python backend:

```
┌─────────────────────────────┐
│  Desktop App (Electron)     │
│  OR  VS Code Extension      │
│           │                 │
│    HTTP + SSE (port 57891)  │
│           ▼                 │
│  FastAPI Backend (Python)   │
│  huggingface_hub calls      │
│  Transfer manager + SSE     │
└─────────────────────────────┘
```

If the desktop app is running, the VS Code extension connects to the same backend automatically.

---

## Desktop App

### Install

Download the latest release for your platform from [Releases](https://github.com/YOUR_USERNAME/hf-hub-desktop/releases):

| Platform | File |
|----------|------|
| macOS (Intel + Apple Silicon) | `HF-Hub-Desktop-1.0.0-mac.dmg` |
| Windows | `HF-Hub-Desktop-1.0.0-win.exe` |
| Linux | `HF-Hub-Desktop-1.0.0-linux.AppImage` |

On macOS you may need to right-click → Open the first time (Gatekeeper).
On Linux: `chmod +x HF-Hub-Desktop-*.AppImage && ./HF-Hub-Desktop-*.AppImage`

### Build from source

```bash
git clone https://github.com/YOUR_USERNAME/hf-hub-desktop
cd hf-hub-desktop
bash setup.sh          # installs all deps

# Development
cd hf-desktop && npm run dev

# Production build
cd hf-desktop && npm run build
# Output: hf-desktop/dist/
```

---

## VS Code Extension

### Install from Marketplace

Search **"HF Hub"** in the VS Code Extensions panel, or:

```
ext install YOUR_PUBLISHER_ID.hf-hub-vscode
```

### Install from .vsix (e.g. on an SSH remote)

```bash
# Copy the .vsix to your server, then:
code --install-extension hf-hub-vscode-1.0.0.vsix
```

### First-time setup (no desktop app)

1. Open VS Code → press `Ctrl+Shift+P` → **HF Hub: Setup Backend**
   - The extension finds its bundled `backend/` folder
   - Creates a Python venv and runs `pip install -r requirements.txt`
   - Starts the backend automatically on port 57891
2. Run **HF Hub: Set Access Token** and paste your token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

The status bar at the bottom right shows `⊙ HF Hub: running` when the backend is up.

### Usage

**Download a model:**
- Click any model in the **HF Hub → Models** sidebar tree, or
- Press `Ctrl+Shift+P` → **HF Hub: Download Model** → type to search → pick save location

**Upload a folder:**
- Right-click any file or folder in the Explorer → **HF Hub: Upload File/Folder to Hub**
- Or press `Ctrl+Shift+P` → **HF Hub: Upload Folder to Hub**

**Monitor progress:**
- Open the **Transfers** tree in the HF Hub sidebar
- Click any transfer to open a live log Output Channel showing speed, ETA, and file-by-file progress

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `hfHub.token` | `""` | HF access token (or set `HF_TOKEN` env var) |
| `hfHub.backendPort` | `57891` | Port the backend listens on |
| `hfHub.backendScript` | `""` | Path to `main.py` (auto-detected if empty) |
| `hfHub.backendPythonPath` | `""` | Path to python executable (auto-detected) |
| `hfHub.autoStartBackend` | `true` | Start backend when extension activates |
| `hfHub.cacheDir` | `""` | Custom HF cache directory |

### HPC / cluster setup

The extension works over VS Code Remote SSH with zero extra steps:

```bash
# 1. Install VS Code Remote SSH extension on your local machine
# 2. Connect to your cluster: Ctrl+Shift+P → Remote-SSH: Connect to Host
# 3. Install the .vsix on the remote:
code --install-extension hf-hub-vscode-1.0.0.vsix
# 4. Open VS Code on the remote, run HF Hub: Setup Backend
# 5. Done — models download directly to cluster storage
```

---

## Backend API

The backend is a standalone FastAPI server. You can also use it directly:

```bash
cd hf-desktop/backend
source .venv/bin/activate
python3 main.py  # starts on http://127.0.0.1:57891
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/auth/token` | Set HF token |
| `GET` | `/auth/status` | Auth status + username |
| `GET` | `/models/search?q=&task=&limit=` | Search models |
| `GET` | `/datasets/search?q=&limit=` | Search datasets |
| `GET` | `/spaces/search?q=&limit=` | Search spaces |
| `GET` | `/repos/list` | List your repos (flat, for upload picker) |
| `GET` | `/repos/` | Full repo details (models + datasets + spaces) |
| `POST` | `/cache/start` | Start a `snapshot_download` |
| `GET` | `/cache/scan` | Scan local HF cache |
| `DELETE` | `/cache/repo/{type}/{id}` | Delete cached repo |
| `POST` | `/uploads/folder` | Upload a folder with live progress |
| `POST` | `/uploads/create-repo` | Create a new Hub repository |
| `GET` | `/transfers/` | List all transfers |
| `DELETE` | `/transfers/{id}` | Cancel or remove a transfer |
| `DELETE` | `/transfers/history` | Clear finished transfers |
| `GET` | `/transfers/stream/events` | **SSE** — live transfer events |

---

## Requirements

**Backend:** Python 3.8+ with `huggingface_hub`, `fastapi`, `uvicorn`

**Desktop app:** Node.js 18+, the backend venv

**VS Code extension:** VS Code 1.85+, Python 3.8+ (on the machine where the backend runs)

---

## License

MIT — see [LICENSE](LICENSE)

Built on [`huggingface_hub`](https://github.com/huggingface/huggingface_hub) (Apache 2.0), [FastAPI](https://fastapi.tiangolo.com) (MIT), [Electron](https://electronjs.org) (MIT), [React](https://react.dev) (MIT).
