const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn, execFileSync } = require('child_process')
const http = require('http')

const PORT = 57891
let backendProcess = null
let mainWindow = null

// ── Python discovery — tries venv first, falls back to system python ──────────

function findPython() {
  // 1. Prefer venv next to backend/
  const backendDir = path.join(__dirname, '..', 'backend')
  const venvCandidates = [
    path.join(backendDir, '.venv', 'bin', 'python3'),
    path.join(backendDir, '.venv', 'bin', 'python'),
    path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
  ]
  for (const p of venvCandidates) {
    if (fs.existsSync(p)) {
      console.log('[backend] Using venv python:', p)
      return p
    }
  }

  // 2. Fall back to system python3 / python
  const systemCandidates = ['python3', 'python']
  for (const cmd of systemCandidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe' })
      console.log('[backend] Using system python:', cmd)
      return cmd
    } catch {}
  }

  return null
}

function startBackend() {
  const py = findPython()
  if (!py) {
    console.error('[backend] No Python found. Run: cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt')
    showBackendError('Python not found. Please run setup.sh first.')
    return
  }

  const script = path.join(__dirname, '..', 'backend', 'main.py')
  if (!fs.existsSync(script)) {
    console.error('[backend] main.py not found at', script)
    showBackendError(`Backend not found at ${script}`)
    return
  }

  const token = process.env.HF_TOKEN || ''
  backendProcess = spawn(py, [script], {
    env: { ...process.env, HF_DESKTOP_PORT: String(PORT) },
    cwd: path.join(__dirname, '..', 'backend'),
  })

  backendProcess.stdout.on('data', d => console.log('[backend]', d.toString().trim()))
  backendProcess.stderr.on('data', d => {
    const msg = d.toString().trim()
    // Uvicorn startup messages come on stderr — not errors
    console.log('[backend]', msg)
  })
  backendProcess.on('exit', (code, signal) => {
    console.log('[backend] exited', code, signal)
    backendProcess = null
  })
  backendProcess.on('error', (err) => {
    console.error('[backend] Failed to spawn:', err.message)
    showBackendError(`Failed to start backend: ${err.message}`)
  })
}

function showBackendError(msg) {
  // Show once window exists, otherwise queue it
  const show = () => {
    if (mainWindow) {
      dialog.showErrorBox('HF Hub — Backend Error', msg + '\n\nRun setup.sh to install dependencies.')
    } else {
      setTimeout(show, 1000)
    }
  }
  show()
}

function waitForBackend(retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http.get(`http://127.0.0.1:${PORT}/health`, res => {
        if (res.statusCode === 200) resolve(true)
        else retry(n)
      }).on('error', () => retry(n))
    }
    const retry = (n) => {
      if (n <= 0) return reject(new Error('Backend did not start in 15 seconds'))
      setTimeout(() => attempt(n - 1), 500)
    }
    attempt(retries)
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 780,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, 'renderer', 'index.html')}`

  mainWindow.loadURL(url)
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('shell:openPath', async (_, p) => shell.openPath(p))
ipcMain.handle('shell:openExternal', async (_, url) => shell.openExternal(url))

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Check if backend is already running (e.g. from a previous session or manual start)
  const alreadyUp = await new Promise(r => {
    http.get(`http://127.0.0.1:${PORT}/health`, res => r(res.statusCode === 200)).on('error', () => r(false))
  })

  if (!alreadyUp) {
    startBackend()
    try {
      await waitForBackend()
    } catch (e) {
      console.error('[backend]', e.message)
      // Still create the window — the UI shows its own error state
    }
  } else {
    console.log('[backend] Already running on port', PORT)
  }

  await createWindow()
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})
