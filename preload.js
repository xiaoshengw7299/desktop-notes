const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData:       ()        => ipcRenderer.invoke('load-data'),
  saveData:       (data)    => ipcRenderer.invoke('save-data', data),
  setOpacity:     (value)   => ipcRenderer.invoke('set-opacity', value),
  setAlwaysOnTop: (value)   => ipcRenderer.invoke('set-always-on-top', value),
  setAutoStart:   (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart:   ()        => ipcRenderer.invoke('get-auto-start'),
  minimizeWindow: ()        => ipcRenderer.invoke('window-minimize'),
  closeWindow:    ()        => ipcRenderer.invoke('window-close'),
});
