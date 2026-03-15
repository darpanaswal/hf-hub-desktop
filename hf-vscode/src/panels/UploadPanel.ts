import * as vscode from 'vscode'
import { HfApi } from '../api'

export class UploadPanel {
  public static currentPanel: UploadPanel | undefined
  private readonly _panel: vscode.WebviewPanel
  private _disposables: vscode.Disposable[] = []

  static createOrShow(extensionUri: vscode.Uri, api: HfApi, initialPath?: string) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
    if (UploadPanel.currentPanel) {
      UploadPanel.currentPanel._panel.reveal(column)
      if (initialPath) UploadPanel.currentPanel._panel.webview.postMessage({ type: 'setPath', path: initialPath })
      return
    }
    const panel = vscode.window.createWebviewPanel('hfHubUpload', 'Upload to HF Hub', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [extensionUri],
    })
    UploadPanel.currentPanel = new UploadPanel(panel, api, initialPath)
  }

  private constructor(panel: vscode.WebviewPanel, private api: HfApi, initialPath?: string) {
    this._panel = panel
    this._panel.webview.html = this._getHtml(initialPath)
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'ready': {
          try {
            const res = await this.api.listMyReposFlat()
            this._panel.webview.postMessage({ type: 'repos', repos: res.repos ?? [], username: res.username ?? '' })
          } catch {
            this._panel.webview.postMessage({ type: 'repos', repos: [], username: '' })
          }
          break
        }
        case 'browse': {
          const result = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Select file or folder',
          })
          if (result?.[0]) {
            this._panel.webview.postMessage({ type: 'setPath', path: result[0].fsPath })
          }
          break
        }
        case 'upload': {
          try {
            await this.api.uploadFolder({
              local_path: msg.localPath,
              repo_id: msg.repoId,
              repo_type: msg.repoType,
              commit_message: msg.commitMessage,
              private: msg.private,
              create_repo: true,
            })
            this._panel.webview.postMessage({ type: 'success', message: `Upload started for ${msg.repoId}` })
            this._panel.webview.postMessage({ type: 'uploadDone' })
            vscode.window.showInformationMessage(`⬆ Uploading to ${msg.repoId}…`)
          } catch (e: any) {
            const detail = e?.response?.data?.detail ?? e?.message ?? String(e)
            this._panel.webview.postMessage({ type: 'error', message: detail })
          }
          break
        }
        case 'createRepo': {
          try {
            await this.api.createRepo({
              repo_id: msg.repoId,
              repo_type: msg.repoType,
              private: msg.private,
            })
            this._panel.webview.postMessage({ type: 'success', message: `Repository ${msg.repoId} created` })
          } catch (e: any) {
            const detail = e?.response?.data?.detail ?? e?.message ?? String(e)
            this._panel.webview.postMessage({ type: 'error', message: detail })
          }
          break
        }
      }
    }, null, this._disposables)

    if (initialPath) {
      setTimeout(() => {
        this._panel.webview.postMessage({ type: 'setPath', path: initialPath })
      }, 300)
    }
  }

  private _getHtml(initialPath?: string): string {
    // Escape for use in HTML attribute value
    const ip = (initialPath ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Upload to HF Hub</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:24px;max-width:640px}
h2{font-size:15px;font-weight:600;margin-bottom:20px}
.field{margin-bottom:14px}
label.lbl{display:block;font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em}
input,select{width:100%;padding:6px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,#454545);border-radius:3px;font-family:inherit;font-size:inherit;outline:none}
input:focus,select:focus{border-color:var(--vscode-focusBorder)}
.hrow{display:flex;gap:8px;align-items:stretch}
.hrow input{flex:1}
.btn{padding:6px 14px;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;font-family:inherit;font-size:inherit;cursor:pointer;white-space:nowrap;line-height:1.4}
.btn:hover{opacity:.85}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-p{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-s{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#ccc)}
.mode-row{display:flex;border:1px solid var(--vscode-input-border,#454545);border-radius:3px;overflow:hidden;margin-bottom:10px}
.mode-btn{flex:1;padding:6px 10px;text-align:center;cursor:pointer;font-size:12px;border:none;font-family:inherit;background:var(--vscode-input-background);color:var(--vscode-descriptionForeground);transition:background .1s}
.mode-btn.active{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.priv-row{display:flex;align-items:center;gap:8px;padding-top:22px}
.priv-row input[type=checkbox]{width:auto;margin:0;cursor:pointer}
.priv-row label{font-size:12px;cursor:pointer;text-transform:none;letter-spacing:0;color:var(--vscode-foreground)}
#limitHint{font-size:10px;opacity:.5;white-space:nowrap}
.actions{display:flex;gap:8px;margin-top:20px}
.msg{margin-top:14px;padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.5;display:none}
.msg-ok{background:rgba(67,183,101,.15);color:#4db36c;border:1px solid rgba(67,183,101,.3)}
.msg-err{background:rgba(211,73,73,.15);color:#e07070;border:1px solid rgba(211,73,73,.3)}
/* dropdown */
.dropdown{position:relative}
#repoListWrap{display:none;position:absolute;z-index:200;top:100%;left:0;right:0;margin-top:2px;background:var(--vscode-dropdown-background,var(--vscode-input-background));border:1px solid var(--vscode-focusBorder);border-radius:3px;max-height:220px;overflow-y:auto}
#repoListWrap.open{display:block}
.repo-search-inp{padding:6px 8px;width:100%;border:none;border-bottom:1px solid var(--vscode-input-border,#454545);background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-family:inherit;font-size:12px;outline:none}
.repo-opt{padding:6px 10px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between}
.repo-opt:hover{background:var(--vscode-list-hoverBackground)}
.repo-opt.sel{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.lock-badge{font-size:10px;opacity:.6}
</style>
</head>
<body>
<h2>🤗 Upload to Hugging Face Hub</h2>

<div class="field">
  <label class="lbl">Local path (file or folder)</label>
  <div class="hrow">
    <input type="text" id="localPath" placeholder="/path/to/your/model" value="${ip}">
    <button class="btn btn-s" id="btnBrowse">Browse…</button>
  </div>
</div>

<div class="field">
  <label class="lbl">Repository</label>
  <div class="mode-row">
    <button class="mode-btn active" id="modeNew">+ New repo</button>
    <button class="mode-btn" id="modeExisting">↩ Existing repo</button>
  </div>
  <div id="newRepoField">
    <input type="text" id="repoIdNew" placeholder="username/my-model">
  </div>
  <div id="existingRepoField" style="display:none" class="dropdown">
    <input type="text" id="repoIdDisplay" placeholder="Select an existing repository…" readonly style="cursor:pointer">
    <input type="hidden" id="repoIdExisting">
    <div id="repoListWrap">
      <input type="text" class="repo-search-inp" id="repoSearch" placeholder="Filter repos…">
      <div id="repoOptions"></div>
    </div>
  </div>
</div>

<div class="grid2">
  <div>
    <label class="lbl">Type</label>
    <select id="repoType">
      <option value="model">Model</option>
      <option value="dataset">Dataset</option>
      <option value="space">Space</option>
    </select>
  </div>
  <div class="priv-row">
    <input type="checkbox" id="isPrivate">
    <label for="isPrivate">Private repo</label>
    <span id="limitHint">~300 GB limit</span>
  </div>
</div>

<div class="field">
  <label class="lbl">Commit message</label>
  <input type="text" id="commitMsg" value="Upload via HF Hub">
</div>

<div class="actions">
  <button class="btn btn-p" id="btnUpload">⬆ Upload</button>
  <button class="btn btn-s" id="btnCreateRepo">+ Create Repo Only</button>
</div>
<div class="msg" id="msg"></div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  let mode = 'new';
  let allRepos = [];
  let dropOpen = false;

  // ── Wire all buttons via addEventListener (onclick= is blocked by CSP) ──────
  document.getElementById('btnBrowse').addEventListener('click', () => {
    vscode.postMessage({ type: 'browse' });
  });

  document.getElementById('modeNew').addEventListener('click', () => setMode('new'));
  document.getElementById('modeExisting').addEventListener('click', () => setMode('existing'));

  document.getElementById('repoIdDisplay').addEventListener('click', toggleDrop);

  document.getElementById('repoSearch').addEventListener('input', () => {
    renderOptions(document.getElementById('repoSearch').value);
  });
  document.getElementById('repoSearch').addEventListener('click', (e) => e.stopPropagation());

  document.getElementById('repoType').addEventListener('change', () => {
    clearExistingSelection();
    renderOptions('');
  });

  document.getElementById('isPrivate').addEventListener('change', () => {
    const priv = document.getElementById('isPrivate').checked;
    document.getElementById('limitHint').textContent = priv ? '50 GB limit (Pro)' : '~300 GB limit';
  });

  document.getElementById('btnUpload').addEventListener('click', doUpload);
  document.getElementById('btnCreateRepo').addEventListener('click', doCreateRepo);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) closeDrop();
  });

  // ── Messages from extension ──────────────────────────────────────────────────
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'setPath') {
      document.getElementById('localPath').value = m.path;
    } else if (m.type === 'repos') {
      allRepos = m.repos || [];
      renderOptions('');
    } else if (m.type === 'success') {
      showMsg('ok', m.message);
      document.getElementById('btnUpload').disabled = false;
    } else if (m.type === 'error') {
      showMsg('err', m.message);
      document.getElementById('btnUpload').disabled = false;
    } else if (m.type === 'uploadDone') {
      document.getElementById('btnUpload').disabled = false;
    }
  });

  // ── On load: request repos ───────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    vscode.postMessage({ type: 'ready' });
  });

  // ── Mode toggle ──────────────────────────────────────────────────────────────
  function setMode(m) {
    mode = m;
    document.getElementById('modeNew').classList.toggle('active', m === 'new');
    document.getElementById('modeExisting').classList.toggle('active', m === 'existing');
    document.getElementById('newRepoField').style.display      = m === 'new'      ? '' : 'none';
    document.getElementById('existingRepoField').style.display = m === 'existing' ? '' : 'none';
  }

  function getRepoId() {
    return mode === 'new'
      ? document.getElementById('repoIdNew').value.trim()
      : document.getElementById('repoIdExisting').value.trim();
  }

  // ── Dropdown ─────────────────────────────────────────────────────────────────
  function toggleDrop() {
    dropOpen = !dropOpen;
    document.getElementById('repoListWrap').classList.toggle('open', dropOpen);
    if (dropOpen) {
      document.getElementById('repoSearch').value = '';
      renderOptions('');
      setTimeout(() => document.getElementById('repoSearch').focus(), 50);
    }
  }
  function closeDrop() {
    dropOpen = false;
    document.getElementById('repoListWrap').classList.remove('open');
  }
  function clearExistingSelection() {
    document.getElementById('repoIdExisting').value = '';
    document.getElementById('repoIdDisplay').value = '';
  }

  function renderOptions(filter) {
    const type = document.getElementById('repoType').value;
    const matches = allRepos.filter(r =>
      r.type === type && (!filter || r.id.toLowerCase().includes(filter.toLowerCase()))
    );
    const selected = document.getElementById('repoIdExisting').value;
    const container = document.getElementById('repoOptions');
    if (!matches.length) {
      container.innerHTML = '<div class="repo-opt" style="opacity:.5;cursor:default">No ' + type + 's found</div>';
      return;
    }
    container.innerHTML = '';
    matches.forEach(r => {
      const div = document.createElement('div');
      div.className = 'repo-opt' + (r.id === selected ? ' sel' : '');
      div.innerHTML = '<span>' + escHtml(r.id) + '</span>' + (r.private ? '<span class="lock-badge">🔒</span>' : '');
      div.addEventListener('click', () => {
        document.getElementById('repoIdExisting').value = r.id;
        document.getElementById('repoIdDisplay').value = r.id;
        closeDrop();
      });
      container.appendChild(div);
    });
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Upload / Create ──────────────────────────────────────────────────────────
  function doUpload() {
    const localPath = document.getElementById('localPath').value.trim();
    const repoId    = getRepoId();
    if (!localPath) { showMsg('err', 'Local path is required'); return; }
    if (!repoId)    { showMsg('err', 'Repository ID is required'); return; }
    document.getElementById('btnUpload').disabled = true;
    showMsg('ok', 'Starting upload…');
    vscode.postMessage({
      type:          'upload',
      localPath,
      repoId,
      repoType:      document.getElementById('repoType').value,
      commitMessage: document.getElementById('commitMsg').value || 'Upload via HF Hub',
      private:       document.getElementById('isPrivate').checked,
    });
  }

  function doCreateRepo() {
    const repoId = getRepoId();
    if (!repoId) { showMsg('err', 'Repository ID is required'); return; }
    const localPath = document.getElementById('localPath').value.trim();
    vscode.postMessage({
      type:     'createRepo',
      repoId,
      localPath,
      repoType: document.getElementById('repoType').value,
      private:  document.getElementById('isPrivate').checked,
    });
  }

  // ── Feedback ──────────────────────────────────────────────────────────────────
  function showMsg(type, text) {
    const el = document.getElementById('msg');
    el.className = 'msg msg-' + type;
    el.textContent = (type === 'ok' ? '✓ ' : '✗ ') + text;
    el.style.display = 'block';
    if (type === 'ok') setTimeout(() => { el.style.display = 'none'; }, 5000);
  }
})();
</script>
</body>
</html>`
  }

  dispose() {
    UploadPanel.currentPanel = undefined
    this._panel.dispose()
    while (this._disposables.length) { this._disposables.pop()?.dispose() }
  }
}
