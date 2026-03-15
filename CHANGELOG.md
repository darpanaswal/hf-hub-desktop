# Changelog

All notable changes to HF Hub Desktop are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- (Nothing yet)

---

## [1.0.0] — 2025-03-15

### Added

#### Desktop App
- Browse 500k+ models and datasets with live search and task filtering
- Real-time upload progress using byte-level tqdm interception via `__wrapped__.__globals__`
- Real-time download progress via `snapshot_download(tqdm_class=...)` parameter
- Files saved directly to `<chosen-dir>/<repo-name>/` — no `.cache` symlinks required
- HF cache mode available for users who want deduplication across projects
- Upload supports existing repo picker (searchable dropdown) vs new repo creation
- Transfer queue with cancel, individual remove, and clear history
- Cache manager: scan, inspect, and delete cached repos with size display
- My Repos tab: view your models, datasets, and spaces with download/open actions
- Spaces browser with SDK badges and external open
- Auth screen with token validation and "continue without token" option
- Download location picker with live path preview before download starts
- Sidebar badges for active upload and download counts independently

#### VS Code Extension
- HF Hub sidebar with Models, Datasets, Transfers, Cache tree views
- Live search QuickPick with 350ms debounce — real API results, not just name matching
- Clicking a model/dataset goes directly to save-location picker then downloads
- Inline download (⬇) and open-in-hub (🔗) buttons on each tree item
- Upload panel webview with existing-vs-new repo picker and searchable dropdown
- Transfer log panel: live ASCII progress bar, speed, ETA, file path, error details
- SSE connection with in-memory state — no HTTP round-trip on every progress tick
- Self-contained `.vsix` — bundles the Python backend, no desktop app required
- "Setup Backend" command: finds Python, creates venv, installs deps automatically
- Status bar item showing backend state with click-to-action menu
- Works over SSH Remote (tested on university HPC clusters)
- Remove individual transfers and clear history from tree view

#### Backend
- FastAPI + uvicorn sidecar shared between desktop app and VS Code extension
- SSE stream (`/transfers/stream/events`) with in-memory subscriber queue
- Thread-safe progress updates via `asyncio.loop.call_soon_threadsafe`
- `/repos/list` endpoint for fast flat repo listing (used by upload picker)
- Proper `TERMINAL_STATUSES` transfer lifecycle with `remove()` vs `cancel()`

### Fixed
- Upload progress stuck at 0%: tqdm patch must target `__wrapped__.__globals__['tqdm']`
- Download progress stuck at 0%: use `tqdm_class=` parameter instead of monkey-patching
- VS Code webview buttons non-functional: replaced `onclick=` with `addEventListener` (CSP fix)
- `asyncio.Queue.put_nowait()` called from thread pool (not thread-safe): fixed with `call_soon_threadsafe`
- SSE client socket timeout killing connections after ~2 minutes: `req.setTimeout(0)`
- SSE frame parsing splitting on `\n` instead of `\n\n`
- Duplicate TypeScript export declarations for `removeTransfer`

---

[Unreleased]: https://github.com/YOUR_USERNAME/hf-hub-desktop/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/YOUR_USERNAME/hf-hub-desktop/releases/tag/v1.0.0
