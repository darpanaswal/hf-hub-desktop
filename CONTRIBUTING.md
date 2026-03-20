# Contributing to HF Hub Desktop

Thank you for your interest in contributing. This document explains how to get set up and what to keep in mind when submitting changes.

## Project layout

```
hf-hub-app/
├── hf-desktop/
│   ├── backend/          Python FastAPI server (shared with VS Code extension)
│   ├── frontend/         React + Vite + Tailwind UI
│   └── electron/         Electron shell (spawns backend, creates window)
├── hf-vscode/
│   ├── backend/          Copy of hf-desktop/backend/ — MUST stay in sync
│   ├── src/              TypeScript extension source
│   └── media/            Icons and static assets
└── .github/              CI, issue templates, PR template
```

## Development setup

### Backend (Python)

```bash
cd hf-desktop/backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run standalone (accessible at http://127.0.0.1:57891)
python3 main.py
```

### Desktop app

```bash
cd hf-desktop
npm install
cd frontend && npm install && cd ..

# Dev mode: starts backend + Vite + Electron
npm run dev
```

### VS Code extension

```bash
cd hf-vscode
npm install

# Compile TypeScript
npm run compile

# Press F5 in VS Code with the hf-vscode/ folder open to launch a dev host
# Or package:
npm run package
```

## Important rules

### Keep backends in sync

`hf-vscode/backend/` is a copy of `hf-desktop/backend/`. Any change to the backend **must be applied to both**. The CI checks that they compile, but it cannot check they are identical. The easiest way:

```bash
# After editing hf-desktop/backend/:
cp -r hf-desktop/backend/* hf-vscode/backend/
```

### TypeScript must compile clean

```bash
cd hf-vscode     && npx tsc -p tsconfig.json --noEmit
cd hf-desktop/frontend && npx tsc -p tsconfig.json --noEmit
```

Neither should produce errors. PRs with TypeScript errors will not be merged.

### Python syntax check

```bash
cd hf-desktop/backend
python -m py_compile main.py state.py
for f in routers/*.py; do python -m py_compile "$f"; done
```

### VS Code webview CSP

All JavaScript in webview HTML panels **must use `addEventListener`** instead of inline `onclick=` attributes. The VS Code Content Security Policy blocks inline event handlers even with `enableScripts: true`. This is a hard requirement.

### Thread safety in the backend

The backend runs `huggingface_hub` calls in `asyncio.run_in_executor()` (a thread pool). Any state update from inside those threads **must** use:

```python
loop.call_soon_threadsafe(lambda kw=kwargs: transfer_manager.update(id, **kw))
```

Never call `transfer_manager.update()` or `asyncio.Queue.put_nowait()` directly from a thread.

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b fix/my-fix`
2. Make your changes
3. Run the checks above
4. Push and open a PR against `main`
5. Fill out the PR template

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include the backend log output — it contains the actual Python traceback when things go wrong.
