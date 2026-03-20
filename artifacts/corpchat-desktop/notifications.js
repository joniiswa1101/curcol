const { Notification, ipcMain } = require("electron");

function setupNotifications(mainWindow) {
  ipcMain.on("send-notification", (_event, title, body, data) => {
    if (!Notification.isSupported()) return;

    const notification = new Notification({
      title: title || "CurCol",
      body: body || "",
      icon: undefined,
      silent: false,
      urgency: "normal",
    });

    notification.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();

        if (data) {
          mainWindow.webContents.send("notification-clicked", data);
        }
      }
    });

    notification.show();
  });

  if (mainWindow) {
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.executeJavaScript(`
        if (!window.__curcolNotificationSetup) {
          window.__curcolNotificationSetup = true;
          
          const OriginalNotification = window.Notification;
          
          window.Notification = class CurColNotification {
            constructor(title, options = {}) {
              if (window.electronAPI) {
                window.electronAPI.sendNotification(
                  title, 
                  options.body || '', 
                  options.data || null
                );
              }
              
              this.title = title;
              this.body = options.body || '';
              this.onclick = null;
            }
            
            static get permission() { return 'granted'; }
            static requestPermission() { return Promise.resolve('granted'); }
            
            close() {}
          };
        }
      `);
    });
  }
}

module.exports = { setupNotifications };
