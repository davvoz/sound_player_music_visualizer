'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ready: () => ipcRenderer.send('renderer:ready'),
  openDialog: (folder = false) => ipcRenderer.invoke('dialog:open', folder),
  expand: (paths) => ipcRenderer.invoke('files:expand', paths),
  metadata: (file) => ipcRenderer.invoke('meta:get', file),
  pathForFile: (file) => webUtils.getPathForFile(file),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  exitFullscreen: () => ipcRenderer.send('win:exit-fullscreen'),
  setTitle: (t) => ipcRenderer.send('win:title', t),
  contextMenu: (data) => ipcRenderer.send('menu:context', data),
  setDefault: () => ipcRenderer.send('assoc:set-default'),
  onFiles: (cb) => ipcRenderer.on('files:open', (_e, files, append) => cb(files, append)),
  onFullscreen: (cb) => ipcRenderer.on('win:fullscreen', (_e, on) => cb(on)),
  onMenu: (cb) => ipcRenderer.on('menu:command', (_e, cmd, arg) => cb(cmd, arg)),
  onToast: (cb) => ipcRenderer.on('app:toast', (_e, text) => cb(text)),
});
