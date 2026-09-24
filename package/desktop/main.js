// BIGJOE Business AI — desktop app main process.
// Thin Electron shell: opens the deployed BIGJOE website in a native window.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

// Write any startup error to %APPDATA%\bigjoe-desktop\crash.log so crashes are never silent.
function logError(err) {
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "crash.log"),
      `[${new Date().toISOString()}] ${(err && err.stack) || err}\n`
    );
  } catch {}
}
process.on("uncaughtException", logError);
process.on("unhandledRejection", logError);

// Load the updater safely: if it's missing from the build, the app still opens.
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (e) {
  logError(e);
}

const BIGJOE_URL = process.env.BIGJOE_URL || "https://bigjoebusinessai.netlify.app";

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
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
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined
    }
  });

  win.setMenuBarVisibility(false);

  // Open non-BIGJOE links (Flutterwave checkout, support links) in the normal browser.
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
    win.loadFile(path.join(__dirname, "offline.html")).catch(logError);
  });

  win.webContents.on("did-fail-load", () => {
    win.loadFile(path.join(__dirname, "offline.html")).catch(logError);
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (autoUpdater && app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(logError);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});