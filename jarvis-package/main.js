const { app, BrowserWindow, ipcMain, Menu, screen, shell, Tray, nativeImage, dialog } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const configDir = path.join(os.homedir(), ".beton-jarvis");
const configFile = path.join(configDir, "config.json");
let mainWindow = null;
let tray = null;
let shellOpen = false;

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configFile, "utf8")); } catch { return {}; }
}

function saveConfig(config) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function commandExists(command) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

function betonCommand(args) {
  const command = process.platform === "win32" ? "beton.cmd" : "beton";
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1, executor: "beton", command: [command, ...args].join(" ") };
}

function betonArgsForRequest(request) {
  const text = request.trim();
  const lower = text.toLowerCase();
  if (/^(show )?(system )?(status|health|doctor)$/i.test(text)) return ["doctor"];
  if (/^(list )?(my )?apps$/i.test(text)) return ["apps"];
  if (/^(show )?(today|today's notes)$/i.test(text)) return ["today"];
  if (/^(read|show|what is in) (the )?(clipboard|clip)$/i.test(text)) return ["clip"];
  const note = text.match(/^(?:save|take|write) (?:a )?note(?: that)?\s+(.+)$/i);
  if (note) return ["note", note[1]];
  const timer = text.match(/^(?:set|start) (?:a )?timer\s+(.+)$/i);
  if (timer) return ["timer", timer[1]];
  const search = text.match(/^(?:search|google)\s+(.+)$/i);
  if (search) return ["search", search[1]];
  const open = text.match(/^(?:open|launch|start)\s+(.+)$/i);
  if (open) return ["open", open[1]];
  if (lower === "lock my computer" || lower === "lock the computer") return ["system", "lock", "--yes"];
  return null;
}

function directShell(command) {
  const shellName = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-lc", command];
  const result = spawnSync(shellName, shellArgs, { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1, executor: "shell" };
}

function actionRisk(command) {
  const text = command.toLowerCase();
  const destructive = /(rm\s+-rf|rmdir|del\s+\/|format\s+|shutdown|restart-computer|stop-computer|remove-item|drop\s+database|git\s+reset\s+--hard|npm\s+uninstall\s+-g|killall|taskkill|chmod\s+777|curl.+\|\s*(sh|bash)|invoke-webrequest.+-outfile)/i.test(text);
  const external = /(send|post|publish|upload|message|email|tweet|telegram|payment|buy|install|uninstall|delete|remove|overwrite|move|rename)/i.test(text);
  return { destructive, external, requiresConfirmation: destructive || external };
}

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

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("BETON JARVIS");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show JARVIS", click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: "Mute", click: () => mainWindow.webContents.send("jarvis:mute") },
    { type: "separator" },
    { label: "Quit", click: () => { app.isQuiting = true; app.quit(); } },
  ]));
  tray.on("click", () => { if (mainWindow.isVisible()) mainWindow.hide(); else { mainWindow.show(); mainWindow.focus(); } });
}

async function getSignedUrl() {
  const config = loadConfig();
  if (!config.agentId) throw new Error("No ElevenLabs Agent ID configured. Run `jarvis setup` first.");
  if (!config.apiKey) return { agentId: config.agentId, signedUrl: null };
  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  url.searchParams.set("agent_id", config.agentId);
  const response = await fetch(url, { headers: { "xi-api-key": config.apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs signed URL request failed (${response.status}).`);
  const data = await response.json();
  return { agentId: config.agentId, signedUrl: data.signed_url };
}

ipcMain.handle("jarvis:get-config", () => {
  const config = loadConfig();
  return { ...config, apiKey: config.apiKey ? "configured" : "" };
});

ipcMain.handle("jarvis:save-config", (_event, patch) => {
  const current = loadConfig();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (patch.apiKey === "configured") next.apiKey = current.apiKey;
  saveConfig(next);
  return { ...next, apiKey: next.apiKey ? "configured" : "" };
});

ipcMain.handle("jarvis:get-signed-url", () => getSignedUrl());

ipcMain.handle("jarvis:open-external", (_event, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be opened.");
  return shell.openExternal(url);
});

ipcMain.handle("jarvis:run-action", async (_event, { command, confirmed = false }) => {
  if (typeof command !== "string" || !command.trim()) throw new Error("A command is required.");
  const risk = actionRisk(command);
  if (risk.requiresConfirmation && !confirmed) return { ok: false, needsConfirmation: true, risk, preview: command };
  try {
    const betonArgs = betonArgsForRequest(command);
    if (commandExists("beton") && betonArgs) return { ...betonCommand(betonArgs), risk };
    const warning = commandExists("beton") ? "No matching Beton subcommand; executed through the system shell." : "Beton CLI was not found; executed through the system shell.";
    return { ...directShell(command), risk, warning };
  } catch (error) {
    return { ok: false, executor: commandExists("beton") ? "beton" : "shell", error: error.message, risk };
  }
});

ipcMain.handle("jarvis:install-beton", () => {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["install", "--global", "beton-cli"], { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1 };
});

ipcMain.on("jarvis:set-shell-open", (_event, value) => { shellOpen = Boolean(value); });
ipcMain.on("jarvis:hide", () => mainWindow?.hide());
ipcMain.on("jarvis:toggle-shell", () => { if (shellOpen) mainWindow.hide(); else { mainWindow.show(); mainWindow.focus(); } });

app.whenReady().then(() => {
  app.commandLine.appendSwitch("enable-features", "WebSpeechRecognition");
  createWindow();
  createTray();
  app.on("activate", () => mainWindow.show());
});

app.on("window-all-closed", (event) => event.preventDefault());
