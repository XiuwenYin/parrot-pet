const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panel', {
  get: () => ipcRenderer.invoke('panel-get'),
  set: (key, value) => ipcRenderer.invoke('panel-set', key, value),
  cmd: (cmd, arg) => ipcRenderer.invoke('panel-cmd', cmd, arg),
  saveNames: (v) => ipcRenderer.invoke('names-save', v),
  teach: (t) => ipcRenderer.invoke('teach-save', t),
  forget: (t) => ipcRenderer.invoke('teach-forget', t),
  aiSave: (cfg) => ipcRenderer.invoke('ai-config-save', cfg),
  onState: (fn) => ipcRenderer.on('panel-state', (_e, s) => fn(s)),
  onTab: (fn) => ipcRenderer.on('panel-tab', (_e, t) => fn(t)),
});
