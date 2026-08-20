const { app, BrowserWindow, ipcMain, Menu, screen, shell, Tray, nativeImage } = require("electron");
const path = require("node:path");
const backend = require("./backend");

let mainWindow = null;
let tray = null;
let shellOpen = false;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const bounds = primary.workArea;
  mainWindow = new BrowserWindow({
    width: 440,
    height: 680,
    x: bounds.x + bounds.width - 480,
    y: bounds.y + 32,
    minWidth: 360,
    minHeight: 520,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "app", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.showInactive());
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function showWindow() {
  mainWindow?.show();
  mainWindow?.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("BETON JARVIS");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show JARVIS", click: showWindow },
    { label: "Mute", click: () => mainWindow?.webContents.send("jarvis:mute") },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on("click", () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

ipcMain.handle("jarvis:get-config", () => backend.publicConfig());
ipcMain.handle("jarvis:save-config", (_event, patch) => backend.saveConfig(patch || {}));
ipcMain.handle("jarvis:get-signed-url", () => backend.getSignedUrl());
ipcMain.handle("jarvis:get-diagnostics", () => backend.diagnostics());
ipcMain.handle("jarvis:run-action", (_event, payload = {}) => backend.executeAction(payload.command, { confirmed: Boolean(payload.confirmed) }));
ipcMain.handle("jarvis:install-beton", () => backend.installBeton());
ipcMain.handle("jarvis:open-external", (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be opened.");
  return shell.openExternal(url);
});

ipcMain.on("jarvis:set-shell-open", (_event, value) => { shellOpen = Boolean(value); });
ipcMain.on("jarvis:hide", () => mainWindow?.hide());
ipcMain.on("jarvis:toggle-shell", () => { if (shellOpen) mainWindow?.hide(); else showWindow(); });

app.whenReady().then(() => {
  app.commandLine.appendSwitch("enable-features", "WebSpeechRecognition");
  createWindow();
  createTray();
  app.on("activate", showWindow);
});

app.on("window-all-closed", (event) => event.preventDefault());
