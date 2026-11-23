// Most między oknem a procesem głównym. Wersja przeglądarkowa ma zamiast niego renderer/web-api.js.
const { contextBridge, ipcRenderer } = require('electron');
const on = ch => fn => ipcRenderer.on(ch, (e, ...a) => fn(...a));
contextBridge.exposeInMainWorld('api', {
  web: false,
  platform: process.platform,
  setLang: l => ipcRenderer.invoke('set-lang', l),
  openFile: p => ipcRenderer.invoke('file-open', p || null),
  saveFile: (p, text, suggested) => ipcRenderer.invoke('file-save', p || null, text, suggested),
  recentList: () => ipcRenderer.invoke('recent-list'),
  autosave: (key, rec) => ipcRenderer.invoke('autosave', key, rec),
  autosaveClear: key => ipcRenderer.invoke('autosave-clear', key),
  autosaveRead: key => ipcRenderer.invoke('autosave-read', key),
  autosaveList: () => ipcRenderer.invoke('autosave-list'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  setDirty: v => ipcRenderer.send('dirty', v),
  closeNow: () => ipcRenderer.send('close-now'),
  newWindow: () => ipcRenderer.send('new-window'),
  setTheme: dark => ipcRenderer.send('theme', dark),
  onSaveThenClose: on('save-then-close'),
  onFullscreen: on('fullscreen'),
  updateGet: () => ipcRenderer.invoke('update-get'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  onUpdate: on('update-status')
});
