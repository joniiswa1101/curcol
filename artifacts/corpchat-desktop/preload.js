const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getPlatform: () => ipcRenderer.invoke("get-platform"),
  getVersion: () => ipcRenderer.invoke("get-version"),

  showWindow: () => ipcRenderer.send("show-window"),
  setBadge: (count) => ipcRenderer.send("set-badge", count),

  sendNotification: (title, body, data) =>
    ipcRenderer.send("send-notification", title, body, data),

  onNotificationClick: (callback) =>
    ipcRenderer.on("notification-clicked", (_event, data) => callback(data)),

  onNavigate: (callback) =>
    ipcRenderer.on("navigate", (_event, path) => callback(path)),

  isElectron: true,
});
