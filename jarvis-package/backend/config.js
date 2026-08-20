const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const configDir = path.join(os.homedir(), ".beton-jarvis");
const configFile = path.join(configDir, "config.json");

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
}

function publicConfig(config = loadConfig()) {
  return { ...config, apiKey: config.apiKey ? "configured" : "" };
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (patch.apiKey === "configured") next.apiKey = current.apiKey;
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return publicConfig(next);
}

function configInfo() {
  return { configDir, configFile };
}

module.exports = { configDir, configFile, configInfo, loadConfig, publicConfig, saveConfig };
