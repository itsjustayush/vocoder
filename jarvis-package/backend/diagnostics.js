const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const packageJson = require("../package.json");
const { configFile, loadConfig } = require("./config");

function commandExists(command) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

function diagnostics() {
  const config = loadConfig();
  const checks = [
    { label: "Node.js 18+", ok: Number(process.versions.node.split(".")[0]) >= 18 },
    { label: "Electron runtime", ok: Boolean(process.versions.electron) || fs.existsSync(path.join(__dirname, "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron")) },
    { label: "Beton CLI", ok: commandExists("beton") },
    { label: "ElevenLabs Agent ID", ok: Boolean(config.agentId) },
    { label: "ElevenLabs API key or allowlist mode", ok: Boolean(config.apiKey) || Boolean(config.agentId) },
    { label: "Local config", ok: fs.existsSync(configFile) },
  ];
  return { package: `${packageJson.name}@${packageJson.version}`, configFile, checks, betonInstalled: commandExists("beton"), voiceConfigured: Boolean(config.agentId) };
}

module.exports = { commandExists, diagnostics };
