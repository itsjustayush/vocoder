# BETON JARVIS

`beton-jarvis` is a local-first desktop voice assistant package. It opens a small always-on-top orb, listens for “Wake up Jarvis” or a two-clap pattern, connects to an ElevenLabs Conversational AI agent for realtime speech, and routes local computer actions through Beton CLI whenever Beton is available.

The package is designed to be updated through npm. The source lives in the `jarvis-package/` directory of the vocoder repository, while the published package is named `beton-jarvis`.

## Requirements

The supported baseline is Node.js 18 or newer. Beton itself additionally requires Python 3.10 or newer. Electron requests microphone access from the operating system the first time the orb starts. The realtime voice path requires an ElevenLabs Agent ID; a local ElevenLabs API key is required when the agent uses signed-URL authentication. If the agent is configured with a hostname allowlist that includes the local desktop origin, the API key can be omitted.

## Install from npm

After the package has been published under your npm account, install it globally:

```bash
npm install --global beton-jarvis
```

Install Beton as well, because JARVIS prefers Beton for local actions:

```bash
npm install --global beton-cli
```

Configure the local voice connection:

```bash
jarvis setup
```

The setup command stores configuration in `~/.beton-jarvis/config.json` with owner-only file permissions. It asks for the ElevenLabs Agent ID, optionally an ElevenLabs API key, and the assistant name. It does not print the API key after saving it.

Verify the installation:

```bash
jarvis doctor
```

Start the orb:

```bash
jarvis
```

The orb remains on top of other windows and can be hidden from its title-bar control or system tray. Use headphones while testing voice interaction.

## Updating the installed assistant

The package includes an update command:

```bash
jarvis update
```

The equivalent npm command is:

```bash
npm install --global beton-jarvis@latest
```

The update replaces the installed package but leaves `~/.beton-jarvis/config.json` in place. After updating, verify the installed release with:

```bash
jarvis doctor
npm list --global beton-jarvis --depth=0
```

## Developing from this repository

From the repository root:

```bash
cd jarvis-package
npm install
npm run build
npm run doctor
npm start
```

The build bundles `src/renderer.js` into `app/renderer.js`. The generated bundle is included in the npm package, so an npm user does not need the repository or a separate build step.

## Backend modules

The installable backend lives in `backend/` and is imported by the Electron main process. `config.js` manages the owner-only local config file, `elevenlabs.js` retrieves signed realtime session URLs, `beton.js` maps supported natural-language requests to Beton subcommands, `risk.js` classifies confirmation-sensitive actions, `executor.js` runs Beton-first actions or the guarded system shell, and `diagnostics.js` powers `jarvis doctor`. These modules ship in the npm tarball and can be required by local integrations through `require("beton-jarvis/backend")` after installation.

To verify the package from a clean install path:

```bash
mkdir jarvis-clean-test
cd jarvis-clean-test
npm init --yes
npm install --global beton-jarvis
jarvis doctor
```

For a repository-only tarball test, run `npm pack` inside `jarvis-package`, then install the generated `.tgz` into the clean test directory with `npm install --global /absolute/path/to/beton-jarvis-0.1.0.tgz`.

## Publishing a release

Publishing requires an npm account with permission to use the package name. The first release is:

```bash
cd jarvis-package
npm login
npm install
npm run build
npm pack --dry-run
npm publish --access public
```

Before publishing, inspect the dry-run file list and confirm that no `.env`, API key, local configuration, or `node_modules` directory is included. The package version is in `package.json`. For a patch release:

```bash
npm version patch
npm publish --access public
```

For a feature release:

```bash
npm version minor
npm publish --access public
```

For a breaking release:

```bash
npm version major
npm publish --access public
```

From the repository root, commit the version change and generated package source after publishing:

```bash
git add jarvis-package
git commit -m "Release beton-jarvis v$(node -p \"require('./jarvis-package/package.json').version\")"
git push origin main
```

## Safety model

JARVIS distinguishes routine local actions from actions that may install, delete, overwrite, publish, send, shut down, restart, or otherwise change the computer irreversibly. Those actions are shown in the orb and require explicit confirmation. Beton is attempted first through its supported subcommands, such as `beton open`, `beton search`, `beton note`, `beton timer`, `beton clip`, `beton apps`, and `beton doctor`. If Beton is not installed or no matching Beton subcommand exists, the app reports that fact and uses the system shell only for actions that have passed the confirmation gate.

This is intentionally a local desktop tool. Do not expose its command bridge to a public network, and do not place an ElevenLabs API key in source control. The package does not claim that generated commands are inherently safe; the confirmation gate is a user checkpoint, not a guarantee.

## Current scope

The first package slice includes the orb HUD, system-tray presence, local wake recognition, two-clap wake detection, ElevenLabs session wiring, text-command fallback, activity messages, Beton-first execution, destructive-action confirmation, setup, doctor, and npm update lifecycle. Future releases can add richer tool schemas, screen context, screenshots, webcam vision, and platform-specific installers without changing the npm update path.
