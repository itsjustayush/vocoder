const { spawnSync } = require("node:child_process");
const { commandExists } = require("./diagnostics");
const { tryBeton } = require("./beton");
const { classifyRisk } = require("./risk");

function runShell(command) {
  const shellName = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
  const shellArgs = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", command] : ["-lc", command];
  const result = spawnSync(shellName, shellArgs, { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1, executor: "shell", command };
}

function executeAction(command, { confirmed = false } = {}) {
  if (typeof command !== "string" || !command.trim()) throw new Error("A command is required.");
  const risk = classifyRisk(command);
  if (risk.requiresConfirmation && !confirmed) return { ok: false, needsConfirmation: true, risk, preview: command };
  try {
    const beton = tryBeton(command);
    if (beton) return { ...beton.result, risk };
    const warning = commandExists("beton") ? "No matching Beton subcommand; executed through the system shell." : "Beton CLI was not found; executed through the system shell.";
    return { ...runShell(command), risk, warning };
  } catch (error) {
    return { ok: false, executor: commandExists("beton") ? "beton" : "shell", error: error.message, risk };
  }
}

function installBeton() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["install", "--global", "beton-cli"], { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1 };
}

module.exports = { executeAction, installBeton, runShell };
