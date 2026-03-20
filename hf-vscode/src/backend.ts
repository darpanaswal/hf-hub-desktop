import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as os from 'os'
import { ChildProcess, spawn, execSync } from 'child_process'

export class BackendManager {
  private process: ChildProcess | null = null
  private _startPromise: Promise<void> | null = null
  private statusBar: vscode.StatusBarItem

  constructor(private ctx: vscode.ExtensionContext) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.statusBar.command = 'hfHub.backendStatus'
    this.ctx.subscriptions.push(this.statusBar)
    this.updateStatusBar('idle')
    this.statusBar.show()
  }

  get port(): number {
    return vscode.workspace.getConfiguration('hfHub').get<number>('backendPort') ?? 57891
  }

  // ── Entry point ─────────────────────────────────────────────────────────────

  async ensureRunning(): Promise<void> {
    if (this._startPromise) return this._startPromise
    this._startPromise = this._doEnsure().finally(() => { this._startPromise = null })
    return this._startPromise
  }

  private async _doEnsure(): Promise<void> {
    if (await this.ping()) {
      this.updateStatusBar('running')
      return
    }

    const script = this.findScript()
    if (!script) {
      await this.promptSetup()
      return
    }

    const python = await this.resolvePython(path.dirname(script))
    if (!python) {
      await this.promptInstall(script)
      return
    }

    await this.launch(script, python)
  }

  // ── Backend script location ─────────────────────────────────────────────────

  findScript(): string | null {
    // 1. User-configured explicit path
    const cfg = vscode.workspace.getConfiguration('hfHub').get<string>('backendScript') ?? ''
    if (cfg && fs.existsSync(cfg)) return cfg

    // 2. Bundled inside the extension (always present after install)
    const bundled = path.join(this.ctx.extensionPath, 'backend', 'main.py')
    if (fs.existsSync(bundled)) return bundled

    // 3. Alongside the extension (monorepo / dev)
    const sibling = path.join(this.ctx.extensionPath, '..', 'hf-desktop', 'backend', 'main.py')
    if (fs.existsSync(sibling)) return sibling

    // 4. User home install
    const home = path.join(os.homedir(), '.hf-hub-desktop', 'backend', 'main.py')
    if (fs.existsSync(home)) return home

    // 5. Env var
    const env = process.env.HF_HUB_BACKEND ?? ''
    if (env && fs.existsSync(env)) return env

    return null
  }

  // ── Python resolution ────────────────────────────────────────────────────────

  async resolvePython(backendDir: string): Promise<string | null> {
    // 1. User-configured python
    const cfgPy = vscode.workspace.getConfiguration('hfHub').get<string>('backendPythonPath') ?? ''
    if (cfgPy && this.pythonHasPackage(cfgPy, 'huggingface_hub')) return cfgPy

    // 2. venv inside the backend directory
    for (const rel of ['.venv/bin/python3', '.venv/bin/python', '.venv/Scripts/python.exe']) {
      const p = path.join(backendDir, rel)
      if (fs.existsSync(p) && this.pythonHasPackage(p, 'fastapi')) return p
    }

    // 3. Conda/system python that already has the packages
    for (const cmd of ['python3', 'python']) {
      if (this.pythonHasPackage(cmd, 'huggingface_hub')) return cmd
    }

    // 4. System python without packages — can install into venv
    for (const cmd of ['python3', 'python']) {
      if (this.pythonExists(cmd)) return null  // exists but missing packages
    }

    return null
  }

  private pythonExists(cmd: string): boolean {
    try { execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 3000 }); return true } catch { return false }
  }

  private pythonHasPackage(cmd: string, pkg: string): boolean {
    try {
      execSync(`"${cmd}" -c "import ${pkg.replace('-', '_')}"`, { stdio: 'pipe', timeout: 5000 })
      return true
    } catch { return false }
  }

  findAnyPython(): string | null {
    const cfgPy = vscode.workspace.getConfiguration('hfHub').get<string>('backendPythonPath') ?? ''
    if (cfgPy && this.pythonExists(cfgPy)) return cfgPy
    for (const cmd of ['python3', 'python']) {
      if (this.pythonExists(cmd)) return cmd
    }
    return null
  }

  // ── Setup prompts ────────────────────────────────────────────────────────────

  private async promptSetup(): Promise<void> {
    const choice = await vscode.window.showErrorMessage(
      'HF Hub: Backend not found.',
      { modal: false },
      'Setup Backend',
      'Set Path Manually',
      'How to Install'
    )
    if (choice === 'Setup Backend') {
      await vscode.commands.executeCommand('hfHub.setupBackend')
    } else if (choice === 'Set Path Manually') {
      await vscode.commands.executeCommand('hfHub.setBackendPath')
    } else if (choice === 'How to Install') {
      vscode.env.openExternal(vscode.Uri.parse('https://github.com/hf-hub-desktop#backend-setup'))
    }
  }

  private async promptInstall(script: string): Promise<void> {
    const backendDir = path.dirname(script)
    const python = this.findAnyPython()

    if (!python) {
      vscode.window.showErrorMessage(
        'HF Hub: Python not found on PATH. Install Python 3.8+ or set hfHub.backendPythonPath in settings.',
        'Open Settings'
      ).then(c => { if (c === 'Open Settings') vscode.commands.executeCommand('workbench.action.openSettings', 'hfHub') })
      return
    }

    const choice = await vscode.window.showWarningMessage(
      `HF Hub: Python found (${python}) but required packages are missing.`,
      'Install Packages',
      'Set Python Path'
    )

    if (choice === 'Install Packages') {
      await this.installDeps(python, backendDir)
    } else if (choice === 'Set Python Path') {
      await vscode.commands.executeCommand('hfHub.setBackendPath')
    }
  }

  // ── Dependency installation ──────────────────────────────────────────────────

  async installDeps(python: string, backendDir: string): Promise<boolean> {
    const reqPath = path.join(backendDir, 'requirements.txt')
    if (!fs.existsSync(reqPath)) {
      vscode.window.showErrorMessage(`requirements.txt not found at ${reqPath}`)
      return false
    }

    return vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'HF Hub: Installing backend dependencies…',
      cancellable: false,
    }, async (progress) => {
      progress.report({ message: 'Creating virtual environment…' })

      const venvDir = path.join(backendDir, '.venv')

      return new Promise<boolean>((resolve) => {
        // Step 1: create venv
        const venvProc = spawn(python, ['-m', 'venv', venvDir], { cwd: backendDir })
        let stderr = ''
        venvProc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
        venvProc.on('close', (code) => {
          if (code !== 0) {
            vscode.window.showErrorMessage(`Failed to create venv: ${stderr}`)
            resolve(false)
            return
          }

          progress.report({ message: 'Installing packages (this may take a minute)…' })

          // Step 2: pip install into venv
          const venvPip = process.platform === 'win32'
            ? path.join(venvDir, 'Scripts', 'pip')
            : path.join(venvDir, 'bin', 'pip')

          const pipProc = spawn(venvPip, ['install', '-r', reqPath, '--quiet'], { cwd: backendDir })
          let pipErr = ''
          pipProc.stderr?.on('data', (d: Buffer) => { pipErr += d.toString() })
          pipProc.on('close', async (pipCode) => {
            if (pipCode !== 0) {
              vscode.window.showErrorMessage(`pip install failed: ${pipErr.slice(-300)}`)
              resolve(false)
              return
            }
            vscode.window.showInformationMessage('HF Hub: Backend packages installed ✓')
            const venvPython = process.platform === 'win32'
              ? path.join(venvDir, 'Scripts', 'python.exe')
              : path.join(venvDir, 'bin', 'python3')
            // Save the venv python path so we use it from now on
            await vscode.workspace.getConfiguration('hfHub').update('backendPythonPath', venvPython, true)
            resolve(true)
          })
        })
      })
    })
  }

  // ── Launch ───────────────────────────────────────────────────────────────────

  async launch(script: string, python: string): Promise<void> {
    const token = vscode.workspace.getConfiguration('hfHub').get<string>('token') ?? ''
    this.updateStatusBar('starting')

    this.process = spawn(python, [script], {
      env: {
        ...process.env,
        HF_DESKTOP_PORT: String(this.port),
        ...(token ? { HF_TOKEN: token } : {}),
      },
      cwd: path.dirname(script),
    })

    const outputChannel = vscode.window.createOutputChannel('HF Hub Backend')
    this.process.stdout?.on('data', (d: Buffer) => outputChannel.append(d.toString()))
    this.process.stderr?.on('data', (d: Buffer) => outputChannel.append(d.toString()))
    this.process.on('exit', (code) => {
      console.log('[hf-backend] exited', code)
      this.process = null
      this.updateStatusBar('stopped')
    })
    this.process.on('error', (err: Error) => {
      vscode.window.showErrorMessage(`HF Hub backend error: ${err.message}`, 'Show Log')
        .then(c => { if (c === 'Show Log') outputChannel.show() })
      this.process = null
      this.updateStatusBar('stopped')
    })

    try {
      await this.waitFor(40) // 20 seconds
      this.updateStatusBar('running')
      vscode.window.showInformationMessage(`HF Hub backend running on port ${this.port} ✓`)
    } catch {
      this.updateStatusBar('stopped')
      const msg = await vscode.window.showErrorMessage(
        `HF Hub: Backend didn't respond on port ${this.port}.`,
        'Show Log',
        'Retry'
      )
      if (msg === 'Show Log') outputChannel.show()
      else if (msg === 'Retry') await this.ensureRunning()
    }
  }

  // ── Status bar ───────────────────────────────────────────────────────────────

  updateStatusBar(state: 'idle' | 'starting' | 'running' | 'stopped') {
    const icons: Record<string, string> = {
      idle:     '$(circle-outline)',
      starting: '$(loading~spin)',
      running:  '$(circle-filled)',
      stopped:  '$(warning)',
    }
    const labels: Record<string, string> = {
      idle:     'HF Hub',
      starting: 'HF Hub: starting…',
      running:  'HF Hub: running',
      stopped:  'HF Hub: stopped',
    }
    this.statusBar.text = `${icons[state]} ${labels[state]}`
    this.statusBar.tooltip = state === 'running'
      ? `HF Hub backend on port ${this.port} — click for status`
      : 'HF Hub backend — click for options'
    this.statusBar.backgroundColor = state === 'stopped'
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.get(`http://127.0.0.1:${this.port}/health`, res => {
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.setTimeout(1500, () => { req.destroy(); resolve(false) })
    })
  }

  private waitFor(retries: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (n: number) => {
        this.ping().then(ok => {
          if (ok) return resolve()
          if (n <= 0) return reject(new Error('timeout'))
          setTimeout(() => attempt(n - 1), 500)
        })
      }
      attempt(retries)
    })
  }

  stop(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
      this.updateStatusBar('stopped')
    }
  }
}
