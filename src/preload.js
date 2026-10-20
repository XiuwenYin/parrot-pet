const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  move: (x, y) => ipcRenderer.send('move', x, y),
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getEnv: (opts) => ipcRenderer.invoke('get-env', opts || {}),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  listRealAssets: (species) => ipcRenderer.invoke('list-real-assets', species),
  showMenu: () => ipcRenderer.send('context-menu'),
  customSound: (name) => ipcRenderer.invoke('custom-sound', name),
  gnawTarget: (near) => ipcRenderer.invoke('gnaw-target', near),
  perchTarget: (near) => ipcRenderer.invoke('perch-target', near),
  tts: (text) => ipcRenderer.invoke('tts', text),
  soundBank: () => ipcRenderer.invoke('sound-bank'),
  desk: (cmd, arg) => ipcRenderer.send('desk', cmd, arg),
  onMenu: (fn) => ipcRenderer.on('menu-cmd', (_e, cmd, arg) => fn(cmd, arg)),
});
