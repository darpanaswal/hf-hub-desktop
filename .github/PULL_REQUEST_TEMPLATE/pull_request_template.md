## What does this PR do?

<!-- One or two sentences describing the change -->

Fixes #<!-- issue number, if applicable -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation
- [ ] CI / build
- [ ] Dependencies update

## Component(s) changed

- [ ] Python backend (`hf-desktop/backend/`)
- [ ] React frontend (`hf-desktop/frontend/`)
- [ ] Electron shell (`hf-desktop/electron/`)
- [ ] VS Code extension (`hf-vscode/`)
- [ ] GitHub Actions (`.github/workflows/`)
- [ ] Documentation

## Checklist

- [ ] I have tested this locally
- [ ] Python files pass `python -m py_compile` (run `cd hf-desktop/backend && python -m py_compile main.py state.py routers/*.py`)
- [ ] TypeScript compiles with no errors (run `npx tsc --noEmit` in `hf-vscode/` and `hf-desktop/frontend/`)
- [ ] I have not introduced new `console.log` or debug prints
- [ ] Backend changes are reflected in both `hf-desktop/backend/` and `hf-vscode/backend/` (they must stay in sync)

## Testing

<!-- How did you test this? What scenarios did you verify?
     Include steps to reproduce the behaviour you verified. -->

## Screenshots (if UI change)

<!-- Before / after screenshots or a short GIF are very helpful -->
