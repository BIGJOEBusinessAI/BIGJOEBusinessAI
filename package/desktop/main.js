// BIGJOE Business AI — desktop app main process.
// This is a thin Electron shell, the same idea as the mobile/ Capacitor wrapper: it just
// opens your deployed BIGJOE website in a native window with a taskbar/dock icon, a proper
// installer, and offline-friendly load-failure handling. The website (public/ + server.js)
// stays the single "consolidated" BIGJOE — this app has no logic of its own.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const { autoUpdater } = require('electron-updater');
// Set this to your deployed HTTPS BIGJOE URL before building an installer.
// Falls back to localhost for local development against `node server.js`.
const BIGJOE_URL = process.env.BIGJOE_URL || "https://REPLACE-WITH-YOUR-BIGJOE-DOMAIN.example.com";

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, "build", "icon.png"),
    backgroundColor: "#071a45",
    title: "BIGJOE Business AI",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.setMenuBarVisibility(false);

  // Open any link that isn't the BIGJOE app itself (e.g. the Flutterwave checkout window,
  // support links) in the person's normal browser instead of inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(BIGJOE_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(BIGJOE_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.loadURL(BIGJOE_URL).catch(() => {
    win.loadFile(path.join(__dirname, "offline.html"));
  });

  win.webContents.on("did-fail-load", () => {
    win.loadFile(path.join(__dirname, "offline.html"));
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
 autoUpdater.checkForUpdatesAndNotify();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
