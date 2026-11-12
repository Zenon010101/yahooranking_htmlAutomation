'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  init: () => ipcRenderer.invoke('app:init'),
  status: () => ipcRenderer.invoke('app:status'),
  chooseRoot: () => ipcRenderer.invoke('app:select-root'),
  setRoot: root => ipcRenderer.invoke('app:set-root', root),
  preview: () => ipcRenderer.invoke('job:preview'),
  update: () => ipcRenderer.invoke('job:update'),
  restore: name => ipcRenderer.invoke('job:restore', name),
  openPreview: () => ipcRenderer.invoke('app:open-preview'),
  openHtml: () => ipcRenderer.invoke('app:open-html'),
  openBackups: () => ipcRenderer.invoke('app:open-rep'),
  openLogs: () => ipcRenderer.invoke('app:open-logs'),
  onLog: handler => { ipcRenderer.on('job:log', (_event, message) => handler(message)); },
  onProgress: handler => { ipcRenderer.on('job:progress', (_event, stage) => handler(stage)); },
  onBusy: handler => { ipcRenderer.on('job:busy', (_event, busy) => handler(busy)); },
};
contextBridge.exposeInMainWorld('ranking', api);
