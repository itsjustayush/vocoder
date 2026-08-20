const { spawnSync } = require("node:child_process");
const { commandExists } = require("./diagnostics");

function betonBinary() {
  return process.platform === "win32" ? "beton.cmd" : "beton";
}

function requestToArgs(request) {
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

function runBeton(args) {
  const command = betonBinary();
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  return { ok: result.status === 0, stdout: result.stdout || "", stderr: result.stderr || "", code: result.status ?? 1, executor: "beton", command: [command, ...args].join(" ") };
}

function tryBeton(request) {
  const args = requestToArgs(request);
  if (!commandExists("beton") || !args) return null;
  return { args, result: runBeton(args) };
}

module.exports = { betonBinary, requestToArgs, runBeton, tryBeton };
