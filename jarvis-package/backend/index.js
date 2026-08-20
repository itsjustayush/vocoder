const config = require("./config");
const diagnostics = require("./diagnostics");
const beton = require("./beton");
const risk = require("./risk");
const executor = require("./executor");
const elevenlabs = require("./elevenlabs");

module.exports = { ...config, ...diagnostics, ...beton, ...risk, ...executor, ...elevenlabs };
