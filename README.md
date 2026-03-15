# HF Hub Desktop

> GUI for Hugging Face Hub — browse, download, and upload models & datasets without writing code.

[![CI](https://github.com/YOUR_USERNAME/hf-hub-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/hf-hub-desktop/actions/workflows/ci.yml)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/darpanaswal.hf-hub-vscode?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=darpanaswal.hf-hub-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Two products, one shared Python backend:

| | Desktop App | VS Code Extension |
|---|---|---|
| **Install** | Download DMG/EXE/AppImage | `ext install darpanaswal.hf-hub-vscode` |
| **Best for** | Local workstation, browsing | SSH/cluster, script-adjacent workflows |
| **Requires** | Nothing extra | Python 3.8+ on PATH |

> **Not affiliated with Hugging Face, Inc.** Uses the [huggingface_hub](https://github.com/huggingface/huggingface_hub) library (Apache 2.0).

---

## Features

- **Browse** 500k+ models, datasets, and Spaces with live search and task filtering
- **Download** with real-time byte-level progress — files go to `<your-dir>/<repo-name>/`, no `.cache` indirection required (HF cache mode also available)
- **Upload** with byte-level progress bar and speed readout — supports existing repo picker or new repo creation
- **Transfer queue** with cancel, individual remove, and history clearing
- **Cache manager** — scan, inspect, and delete cached repos
- **My Repos** — view and manage your own models, datasets, and Spaces
- **VS Code sidebar** with live transfer log panel (click any transfer to see progress, speed, ETA, errors)
- **Self-contained VS Code extension** — bundles the Python backend, works on HPC clusters over SSH

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Desktop App (Electron + React)         │
│  OR  VS Code Extension (sidebar/panel)  │
│              │ HTTP + SSE               │
│  ┌───────────▼─────────────────────┐    │
│  │  FastAPI Backend (Python)       │    │
│  │  huggingface_hub calls          │    │
│  │  Thread-safe SSE progress       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

The Python backend runs on `127.0.0.1:57891` and is shared — if the desktop app is running, the VS Code extension connects to it automatically.

---

## Installation

### Desktop App

Download the latest release for your platform from [Releases](https://github.com/YOUR_USERNAME/hf-hub-desktop/releases):

- **macOS**: `HF-Hub-Desktop-x.x.x.dmg`
- **Windows**: `HF-Hub-Desktop-Setup-x.x.x.exe`
- **Linux**: `HF-Hub-Desktop-x.x.x.AppImage` (no install needed — `chmod +x` and run)

### VS Code Extension

**From Marketplace:**
```
ext install darpanaswal.hf-hub-vscode
```

**Manual install** (for clusters without internet access in VS Code):
```bash
# On your local machine:
# Download hf-hub-vscode-x.x.x.vsix from Releases

# Copy to the cluster and install:
code --install-extension hf-hub-vscode-x.x.x.vsix
```

**First-time setup on a cluster:**
1. Open VS Code command palette (`Ctrl+Shift+P`)
2. Run `HF Hub: Setup Backend` — this finds Python, creates a venv, and installs dependencies automatically
3. Run `HF Hub: Set Access Token` — paste your token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)

---

## Development setup

See [CONTRIBUTING.md](CONTRIBUTING.md) for full instructions. Quick start:

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/hf-hub-desktop.git
cd hf-hub-desktop

# One-command setup
bash setup.sh

# Start desktop app (dev mode)
cd hf-desktop && npm run dev

# Start backend only (for VS Code extension dev)
cd hf-desktop/backend
source .venv/bin/activate
python3 main.py
```

---

## Configuration

### VS Code extension settings

| Setting | Default | Description |
|---|---|---|
| `hfHub.token` | `""` | HF access token (or set `HF_TOKEN` env var) |
| `hfHub.backendPort` | `57891` | Port for the backend server |
| `hfHub.backendScript` | auto | Path to `main.py` (auto-detected) |
| `hfHub.backendPythonPath` | auto | Path to Python executable |
| `hfHub.autoStartBackend` | `true` | Start backend on extension activation |

---

## FAQ

**Q: Do I need the desktop app to use the VS Code extension?**
No. The extension bundles the backend inside the `.vsix` file. Run `HF Hub: Setup Backend` to install Python dependencies into a local venv.

**Q: Does it use the HF cache (`.cache/huggingface`)?**
Only if you choose "HF cache" in the download modal. The default "Choose folder" mode downloads files directly to `<your-dir>/<repo-name>/` with no cache involvement.

**Q: Can I use it on an HPC cluster with no internet in VS Code?**
Yes — download the `.vsix` on your local machine, copy it to the cluster, and install with `code --install-extension`. The Python deps install from PyPI (which clusters usually allow outbound).

**Q: What HF token scopes do I need?**
Read access for browsing and downloading. `write` scope for uploading and creating repos.

---

## License

MIT — see [LICENSE](LICENSE).

The `huggingface_hub` library is used under Apache 2.0.
