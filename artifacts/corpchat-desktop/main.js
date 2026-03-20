const { app, BrowserWindow, Menu, globalShortcut, shell, ipcMain, nativeTheme } = require("electron");
const path = require("path");
const { setupTray } = require("./tray");
const { setupNotifications } = require("./notifications");

const APP_URL = process.env.CURCOL_URL || "https://curcol.link";
const isDev = process.env.NODE_ENV === "development";

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "CurCol",
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f172a" : "#ffffff",
    show: false,
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error(`[CurCol] Failed to load: ${errorCode} - ${errorDescription}`);
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL(APP_URL);
    }, 3000);
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function createAppMenu() {
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "CurCol",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.executeJavaScript(
                'window.dispatchEvent(new CustomEvent("curcol:new-chat"))'
              );
            }
          },
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Chat",
      submenu: [
        {
          label: "Search Messages",
          accelerator: "CmdOrCtrl+F",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(
                'window.dispatchEvent(new CustomEvent("curcol:search"))'
              );
            }
          },
        },
        {
          label: "Go to Chat List",
          accelerator: "CmdOrCtrl+1",
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.executeJavaScript(
                'window.dispatchEvent(new CustomEvent("curcol:goto-chats"))'
              );
            }
          },
        },
        {
          label: "Go to Directory",
          accelerator: "CmdOrCtrl+2",
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.executeJavaScript(
                'window.dispatchEvent(new CustomEvent("curcol:goto-directory"))'
              );
            }
          },
        },
        {
          label: "Go to Announcements",
          accelerator: "CmdOrCtrl+3",
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
          label: "Mark All as Read",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(
                'window.dispatchEvent(new CustomEvent("curcol:mark-all-read"))'
              );
            }
          },
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(process.platform === "darwin"
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function registerGlobalShortcuts() {
  globalShortcut.register("CmdOrCtrl+Shift+C", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

app.on("ready", () => {
  createWindow();
  createAppMenu();
  registerGlobalShortcuts();

  tray = setupTray(mainWindow, isQuitting, () => {
    isQuitting = true;
    app.quit();
  });

  setupNotifications(mainWindow);
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("get-platform", () => process.platform);
ipcMain.handle("get-version", () => app.getVersion());

ipcMain.on("show-window", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.on("set-badge", (_event, count) => {
  if (process.platform === "darwin") {
    app.dock.setBadge(count > 0 ? String(count) : "");
  }
  if (tray) {
    tray.setToolTip(count > 0 ? `CurCol (${count} unread)` : "CurCol");
  }
});
