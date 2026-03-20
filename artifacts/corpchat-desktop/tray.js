const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");

function setupTray(mainWindow, isQuitting, quitApp) {
  const iconPath = path.join(__dirname, "assets", "icon.png");
  
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      trayIcon = nativeImage.createEmpty();
    }
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  const tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open CurCol",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "New Chat",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.executeJavaScript(
            'window.dispatchEvent(new CustomEvent("curcol:new-chat"))'
          );
        }
      },
    },
    {
      label: "View Announcements",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.executeJavaScript(
            'window.dispatchEvent(new CustomEvent("curcol:goto-announcements"))'
          );
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit CurCol",
      click: () => {
        quitApp();
      },
    },
  ]);

  tray.setToolTip("CurCol");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return tray;
}

module.exports = { setupTray };
