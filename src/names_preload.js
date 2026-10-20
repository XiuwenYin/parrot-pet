const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('names', {
  get: () => ipcRenderer.invoke('names-get'),
  save: (v) => ipcRenderer.invoke('names-save', v),
  teachGet: () => ipcRenderer.invoke('teach-get'),
  teach: (t) => ipcRenderer.invoke('teach-save', t),
  forget: (t) => ipcRenderer.invoke('teach-forget', t),
});
