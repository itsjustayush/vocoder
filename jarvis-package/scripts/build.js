const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "app");

async function main() {
  fs.mkdirSync(appDir, { recursive: true });
  await build({
    entryPoints: [path.join(root, "src", "renderer.js")],
    outfile: path.join(appDir, "renderer.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    minify: false,
    sourcemap: false,
    logLevel: "info",
  });
  console.log("BETON JARVIS renderer built.");
}

main().catch((error) => {
  console.error(`JARVIS build failed: ${error.message}`);
  process.exitCode = 1;
});
