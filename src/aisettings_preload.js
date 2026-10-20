const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aiSettings', {
  get: () => ipcRenderer.invoke('ai-config-get'),
  save: (cfg) => ipcRenderer.invoke('ai-config-save', cfg),
});
