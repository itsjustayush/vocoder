# PALM / VOCODER

A browser-based hand-controlled vocal synthesizer inspired by the hand-gated vocoder performance language of [@musicbysonam](https://www.instagram.com/musicbysonam/). The prototype combines MediaPipe hand landmarks with a Web Audio AudioWorklet so the palm controls when the vocoder enters the voice signal and how the return is shaped.

## Interaction model

| Gesture or control | Effect |
| --- | --- |
| Open palm | Gates the vocoder on. A closed or missing hand returns to the dry input path. |
| Palm left / right | Maps to a musical pitch shift of roughly ±9 semitones. |
| Palm up / down | Maps to brightness and harmonic color. |
| Vocoder mix | Controls the dry-to-synth blend. |
| Analog drive | Adds nonlinear amplification and edge. |
| Test gate | Manual fallback for trying the signal path without a camera. |

## Run locally

```bash
pnpm install
pnpm dev
```

Open the printed local URL in a modern Chromium-based browser. Press **Start Session** and allow camera and microphone access. Headphones are recommended to avoid feedback. The hand model is loaded from the MediaPipe CDN, while audio processing runs locally in the browser.

## Implementation notes

`client/src/App.tsx` owns the instrument state, camera preview, hand-landmark loop, gesture mapping, and Web Audio graph. `public/vocoder-processor.js` contains the real-time AudioWorklet: it uses a compact eight-band filterbank, smoothed band envelopes, harmonic carriers, gate/mix/pitch/brightness parameters, and a soft saturation stage. `client/src/styles.css` supplies the dark studio visual system, responsive stage layout, gesture telemetry, waveform rack, and microphone-permission empty state.

The first version intentionally keeps audio local and does not upload camera or microphone data. The app requires HTTPS or localhost for device permissions, plus a browser that supports `AudioWorklet` and WebGL-backed MediaPipe Tasks Vision.

## JARVIS desktop assistant

The JARVIS work now lives in `jarvis-package/` in this repository. It is an npm-installable Electron orb with wake-word and two-clap activation, ElevenLabs realtime voice wiring, Beton-first local actions, and confirmation gates for destructive commands.

```bash
cd jarvis-package
npm install
npm run build
npm run doctor
npm start
```

See [`jarvis-package/README.md`](./jarvis-package/README.md) for setup, updates, versioning, and npm publishing.
