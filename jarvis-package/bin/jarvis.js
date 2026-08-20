#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const packageJson = require("../package.json");
const args = process.argv.slice(2);
const configDir = path.join(os.homedir(), ".beton-jarvis");
const configFile = path.join(configDir, "config.json");
const electronShim = path.join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
function resolveElectronBinary() {
  try {
    const resolved = require("electron");
    if (typeof resolved === "string" && fs.existsSync(resolved)) return resolved;
  } catch {}
  return electronShim;
}
const electronBinary = resolveElectronBinary();
const mainFile = path.join(__dirname, "..", "main.js");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit", ...options });
  if (result.error) {
    console.error(`jarvis: ${result.error.message}`);
    return result.status || 1;
  }
  return result.status || 0;
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
}

function hasCommand(command) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function setup() {
  const current = loadConfig();
  console.log("\nBETON JARVIS setup\n");
  console.log("ElevenLabs supports realtime voice through a Conversational AI agent.");
  console.log("Keep your API key local. It is stored in ~/.beton-jarvis/config.json with owner-only permissions.\n");
  const agentId = await prompt(`ElevenLabs Agent ID${current.agentId ? ` [${current.agentId}]` : ""}: `);
  const apiKey = await prompt("ElevenLabs API key (leave blank if your agent uses an allowlist): ");
  const wakeName = await prompt(`Assistant name${current.wakeName ? ` [${current.wakeName}]` : " [Jarvis]"}: `);
  const config = {
    ...current,
    agentId: agentId || current.agentId || "",
    apiKey: apiKey || current.apiKey || "",
    wakeName: wakeName || current.wakeName || "Jarvis",
    confirmDestructive: true,
    updatedAt: new Date().toISOString(),
  };
  saveConfig(config);
  console.log(`\nSaved ${configFile}`);
  console.log("Run `jarvis doctor`, then `jarvis` to open the orb.\n");
}

function doctor() {
  const config = loadConfig();
  const checks = [
    ["Node.js 18+", Number(process.versions.node.split(".")[0]) >= 18],
    ["Electron runtime", fs.existsSync(electronBinary)],
    ["Beton CLI", hasCommand("beton")],
    ["ElevenLabs Agent ID", Boolean(config.agentId)],
    ["ElevenLabs API key or allowlist mode", Boolean(config.apiKey) || Boolean(config.agentId)],
    ["Config directory", fs.existsSync(configDir)],
  ];
  console.log("\nBETON JARVIS doctor\n");
  for (const [label, ok] of checks) console.log(`${ok ? "[ok]" : "[--]"} ${label}`);
  console.log(`\nConfig: ${configFile}`);
  console.log(`Package: ${packageJson.name}@${packageJson.version}`);
  if (!hasCommand("beton")) console.log("\nBeton is not installed. Install it with: npm install -g beton-cli");
  if (!config.agentId) console.log("ElevenLabs is not configured. Run: jarvis setup");
  return 0;
}

function update() {
  console.log(`Updating ${packageJson.name} through npm...`);
  const status = run(npmCommand, ["install", "--global", `${packageJson.name}@latest`]);
  if (status === 0) console.log("JARVIS is updated. Run `jarvis doctor` to verify the installation.");
  return status;
}

function launch() {
  if (!fs.existsSync(electronBinary)) {
    console.error("Electron is not installed. Run `npm install -g beton-jarvis` again or install from the package directory.");
    process.exitCode = 1;
    return;
  }
  const child = spawn(electronBinary, [mainFile, ...args], { stdio: "inherit", detached: false, windowsHide: false });
  child.on("error", (error) => {
    console.error(`jarvis: ${error.message}`);
    process.exitCode = 1;
  });
}

(async () => {
  const command = args[0];
  if (command === "setup") return setup();
  if (command === "doctor") return doctor();
  if (command === "update" || (command === "version" && args.includes("--upgrade"))) return update();
  launch();
})();
