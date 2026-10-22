const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  saveFiles: (files) => ipcRenderer.invoke("save-crops", files),
});
