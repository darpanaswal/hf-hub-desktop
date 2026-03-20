const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  platform: process.platform,
})
