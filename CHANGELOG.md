# Changelog

All notable changes to HF Hub Desktop are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.1] — 2026-03-20

### Fixed
- Download of selected individual files no longer crashes with
  `hf_hub_download() got an unexpected keyword argument 'tqdm_class'`
  on huggingface_hub versions below 0.25.0. Progress tracking now uses
  the `__globals__` patch approach instead of the `tqdm_class` parameter,
  making it version-independent.
- Bumped minimum huggingface_hub requirement to >=0.25.0 in requirements.txt

---

## [1.1.0] — 2026-03-20

### Added
- **Individual file downloads**: the download modal now shows a file picker — check individual files to download only those instead of the full repo
- **Subfolder option for downloads**: a checkbox controls whether files are saved into `<dir>/<repo-name>/` (default) or directly into the chosen directory
- **Multi-file upload**: drag and drop multiple files onto the upload drop zone; each file is uploaded individually preserving filenames

### Fixed
- **Download progress stuck at 0%**: `ProgressTqdm.update()` now fires the progress callback *before* calling `super().update()`, ensuring it runs regardless of `disable=True` behaviour in the tqdm base class
- **Silent progress loss under load**: `state.py` queue was silently dropping SSE updates when full (200 items); now evicts the oldest item and retries instead of discarding
- **Duplicate `remove()` method in `state.py`**: Python silently used the last definition, which skipped cleanup of internal state; fixed to single correct implementation
- **No repo type selector for downloads**: removed the Model/Dataset/Space dropdown from the download modal — the backend already auto-detects the repo type, and selecting the wrong type would cause the download to fail

### Changed
- Download progress updates are throttled to at most 4 per second per transfer to avoid flooding the SSE queue on fast connections

---

## [1.1.0] — 2026-03-20

### Added
- Download individual files: file picker in the download modal loads the full repo
  file list — select any subset to download rather than the entire repository
- Subfolder checkbox in the download modal: optionally create a `<repo-name>/`
  subfolder inside your chosen directory (on by default, can be unchecked)
- Multi-file upload: new Files button in the upload form opens a native
  multi-file selection dialog alongside the existing Folder button

---

## [1.0.0] — 2026-03-15

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
- Inline download and open-in-hub buttons on each tree item
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

[Unreleased]: https://github.com/darpanaswal/hf-hub-desktop/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/darpanaswal/hf-hub-desktop/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/darpanaswal/hf-hub-desktop/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/darpanaswal/hf-hub-desktop/releases/tag/v1.0.0
