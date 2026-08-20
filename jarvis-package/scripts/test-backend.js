const assert = require("node:assert/strict");
const backend = require("../backend");

assert.equal(typeof backend.executeAction, "function");
assert.equal(typeof backend.getSignedUrl, "function");
assert.deepEqual(backend.requestToArgs("open terminal"), ["open", "terminal"]);
assert.deepEqual(backend.requestToArgs("search vocoder"), ["search", "vocoder"]);
assert.equal(backend.classifyRisk("delete the old file").requiresConfirmation, true);
assert.equal(backend.classifyRisk("show system status").requiresConfirmation, false);
const safeCommand = process.platform === "win32" ? "Write-Output jarvis-backend-ok" : "printf jarvis-backend-ok";
const safe = backend.executeAction(safeCommand);
assert.equal(safe.ok, true);
assert.match(safe.stdout, /jarvis-backend-ok/);
console.log("JARVIS backend smoke tests passed.");
