import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  ArrowUpRight,
  Camera,
  CircleAlert,
  Hand,
  Headphones,
  Mic2,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  Zap,
} from "lucide-react";

type Landmark = { x: number; y: number; z?: number };

type Mode = "idle" | "loading" | "ready" | "running" | "error";

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function fingerOpenScore(landmarks: Landmark[]) {
  if (landmarks.length < 21) return 0;
  const wrist = landmarks[0];
  const fingerPairs: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]];
  const extended = fingerPairs.reduce((score, [tip, pip]) => {
    const tipDistance = Math.hypot(landmarks[tip].x - wrist.x, landmarks[tip].y - wrist.y);
    const pipDistance = Math.hypot(landmarks[pip].x - wrist.x, landmarks[pip].y - wrist.y);
    return score + (tipDistance > pipDistance * 1.08 ? 1 : 0);
  }, 0);
  return extended / fingerPairs.length;
}

function formatControl(value: number, suffix = "") {
  return `${Math.round(value)}${suffix}`;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const waveformFrameRef = useRef<number | null>(null);
  const smoothOpenRef = useRef(0);
  const lastGestureRef = useRef({ open: 0, x: 0.5, y: 0.5, detected: false });

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState("");
  const [handDetected, setHandDetected] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [openScore, setOpenScore] = useState(0);
  const [handX, setHandX] = useState(0.5);
  const [handY, setHandY] = useState(0.5);
  const [outputLevel, setOutputLevel] = useState(0.06);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 48 }, () => 0.08));
  const [manualGate, setManualGate] = useState(false);
  const [mix, setMix] = useState(86);
  const [drive, setDrive] = useState(26);

  const updateParam = useCallback((name: string, value: number) => {
    const param = workletRef.current?.parameters.get(name);
    if (param) param.setTargetAtTime(value, audioContextRef.current?.currentTime ?? 0, 0.04);
  }, []);

  const drawHand = useCallback((landmarks: Landmark[] | undefined) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(231, 255, 98, .82)";
    ctx.lineWidth = Math.max(2.5, width / 240);
    CONNECTIONS.forEach(([start, end]) => {
      ctx.beginPath();
      ctx.moveTo(landmarks[start].x * width, landmarks[start].y * height);
      ctx.lineTo(landmarks[end].x * width, landmarks[end].y * height);
      ctx.stroke();
    });
    landmarks.forEach((point, index) => {
      ctx.beginPath();
      ctx.fillStyle = index === 0 ? "#ffffff" : "#e7ff62";
      ctx.arc(point.x * width, point.y * height, index === 0 ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  const stopExperience = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (waveformFrameRef.current) cancelAnimationFrame(waveformFrameRef.current);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    frameRef.current = null;
    waveformFrameRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    workletRef.current = null;
    analyserRef.current = null;
    handLandmarkerRef.current = null;
    setHandDetected(false);
    setIsOpen(false);
    setOpenScore(0);
    setOutputLevel(0.06);
    setMode("idle");
  }, []);

  useEffect(() => () => stopExperience(), [stopExperience]);

  const detectionLoop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = handLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(detectionLoop);
      return;
    }

    const result = landmarker.detectForVideo(video, performance.now());
    const landmarks = result.landmarks[0] as Landmark[] | undefined;
    drawHand(landmarks);

    if (landmarks) {
      const rawOpen = fingerOpenScore(landmarks);
      smoothOpenRef.current = smoothOpenRef.current * 0.74 + rawOpen * 0.26;
      const palmPoints = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
      const palmX = 1 - palmPoints.reduce((sum, point) => sum + point.x, 0) / palmPoints.length;
      const palmY = palmPoints.reduce((sum, point) => sum + point.y, 0) / palmPoints.length;
      const nextOpen = smoothOpenRef.current;
      const gate = manualGate || nextOpen > 0.58 ? 1 : 0;
      const normalizedX = clamp(palmX);
      const normalizedY = clamp(palmY);
      const pitch = (normalizedX - 0.5) * 18;
      const brightness = clamp(1 - normalizedY, 0.16, 0.98);
      updateParam("gate", gate);
      updateParam("pitch", pitch);
      updateParam("brightness", brightness);
      lastGestureRef.current = { open: nextOpen, x: normalizedX, y: normalizedY, detected: true };
      setHandDetected(true);
      setIsOpen(gate > 0.5);
      setOpenScore(nextOpen);
      setHandX(normalizedX);
      setHandY(normalizedY);
    } else {
      updateParam("gate", manualGate ? 1 : 0);
      lastGestureRef.current.detected = false;
      setHandDetected(false);
      setIsOpen(manualGate);
      setOpenScore(0);
    }

    frameRef.current = requestAnimationFrame(detectionLoop);
  }, [drawHand, manualGate, updateParam]);

  const waveformLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      const nextWave = Array.from({ length: 48 }, (_, index) => {
        const sample = data[Math.floor((index / 48) * data.length)] ?? 128;
        return clamp(Math.abs(sample - 128) / 128 * 2.6, 0.06, 1);
      });
      setWaveform(nextWave);
      setOutputLevel(nextWave.reduce((sum, value) => sum + value, 0) / nextWave.length);
    }
    waveformFrameRef.current = requestAnimationFrame(waveformLoop);
  }, []);

  const startExperience = useCallback(async () => {
    if (mode === "running" || mode === "loading") return;
    setMode("loading");
    setError("");
    try {
      const [vision, stream] = await Promise.all([
        FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, autoGainControl: true, noiseSuppression: true },
          video: { width: 1280, height: 720, facingMode: "user" },
        }),
      ]);
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      const context = new AudioContext();
      await context.audioWorklet.addModule("/vocoder-processor.js");
      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, "palm-vocoder-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        parameterData: { gate: 0, mix: mix / 100, pitch: 0, brightness: 0.62, drive: drive / 100 },
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(worklet).connect(analyser).connect(context.destination);
      await context.resume();
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      mediaStreamRef.current = stream;
      handLandmarkerRef.current = landmarker;
      audioContextRef.current = context;
      workletRef.current = worklet;
      analyserRef.current = analyser;
      worklet.port.onmessage = (event) => setOutputLevel(event.data.level ?? 0.06);
      setMode("running");
      frameRef.current = requestAnimationFrame(detectionLoop);
      waveformFrameRef.current = requestAnimationFrame(waveformLoop);
    } catch (startError) {
      console.error(startError);
      setMode("error");
      setError("Camera or microphone access was blocked. Try again, then allow both permissions.");
    }
  }, [detectionLoop, drive, mix, mode, waveformLoop]);

  useEffect(() => {
    updateParam("mix", mix / 100);
  }, [mix, updateParam]);

  useEffect(() => {
    updateParam("drive", drive / 100);
  }, [drive, updateParam]);

  const pitchLabel = formatControl((handX - 0.5) * 18, " st");
  const brightnessLabel = formatControl(handY * 100, "%");
  const gateLabel = manualGate ? "manual" : isOpen ? "open palm" : "waiting";

  return (
    <main className="app-shell">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <div className="wordmark"><span className="wordmark-mark">◒</span> PALM / VOCODER <span className="wordmark-muted">01</span></div>
        <div className="topbar-right">
          <div className="live-indicator"><span className="live-dot" /> LIVE EXPERIMENT</div>
          <a href="https://www.instagram.com/musicbysonam/" target="_blank" rel="noreferrer" className="profile-link">inspired by @musicbysonam <ArrowUpRight size={14} /></a>
        </div>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> HAND-TRACKED VOICE INSTRUMENT</div>
          <h1>SING<br /><em>WITH</em><br />YOUR HANDS<span className="lime-dot">.</span></h1>
          <p className="hero-description">A palm-open vocoder for the browser. Move through pitch and color with your hand, then open up to let the machine sing back.</p>
          <div className="hero-notes">
            <div><span>01</span><p>Allow camera + mic</p></div>
            <div><span>02</span><p>Open your palm to gate</p></div>
            <div><span>03</span><p>Move up / sideways to play</p></div>
          </div>
        </div>

        <div className="instrument-column">
          <div className="stage-card">
            <div className="stage-header">
              <div className="stage-title"><span className={`signal-dot ${mode === "running" ? "signal-dot-live" : ""}`} /> SIGNAL STAGE</div>
              <span className="mono">{mode === "running" ? "48 KHZ / 01 HAND" : "STANDBY / 01 HAND"}</span>
            </div>
            <div className="camera-frame">
              <video ref={videoRef} className="camera-video" playsInline muted aria-label="Camera preview for hand tracking" />
              <canvas ref={canvasRef} className="landmark-canvas" aria-hidden="true" />
              {mode !== "running" && <div className="camera-empty"><div className="camera-icon"><Camera size={22} /></div><strong>YOUR CAMERA BECOMES THE CONTROLLER</strong><span>Open palm = vocoder on</span></div>}
              <div className="camera-overlay top-left">{handDetected ? "HAND LOCKED" : "NO HAND"}<span className="corner-mark" /></div>
              <div className="camera-overlay top-right">{Math.round(openScore * 100)}% OPEN</div>
              <div className="camera-overlay bottom-left"><span className={`status-pill ${isOpen ? "status-pill-on" : ""}`}><span className="pill-dot" /> {gateLabel}</span></div>
              <div className="camera-overlay bottom-right"><span className="mono">X {Math.round(handX * 100).toString().padStart(2, "0")} / Y {Math.round((1 - handY) * 100).toString().padStart(2, "0")}</span></div>
            </div>
            <div className="stage-controls">
              <button className={`primary-button ${mode === "running" ? "is-running" : ""}`} onClick={mode === "running" ? stopExperience : startExperience}>
                {mode === "running" ? <><span className="button-live-dot" /> STOP SESSION</> : <><Play size={16} fill="currentColor" /> START SESSION</>}
              </button>
              <button className={`manual-button ${manualGate ? "manual-button-on" : ""}`} onClick={() => setManualGate((value) => !value)} title="Fallback gate for testing without a hand">
                <Zap size={15} /> {manualGate ? "MANUAL GATE ON" : "TEST GATE"}
              </button>
            </div>
            {mode === "error" && <div className="error-message"><CircleAlert size={16} /> {error}</div>}
          </div>

          <div className="signal-rack">
            <div className="rack-heading"><span>VOICE SIGNAL</span><span className="mono">INPUT → OUTPUT</span></div>
            <div className="waveform" aria-label="Live audio waveform">
              {waveform.map((value, index) => <span key={index} style={{ height: `${Math.max(8, value * 100)}%`, opacity: 0.35 + value * 0.75 }} />)}
            </div>
            <div className="meter-row"><span>OUTPUT LEVEL</span><div className="level-track"><span style={{ width: `${clamp(outputLevel) * 100}%` }} /></div><strong>{Math.round(clamp(outputLevel) * 100).toString().padStart(2, "0")}</strong></div>
          </div>
        </div>
      </section>

      <section className="control-grid">
        <div className="control-intro"><div className="eyebrow"><span className="eyebrow-line" /> GESTURE MAP</div><h2>Your hand is<br /><span>the synth.</span></h2><p>Nothing to touch. The stage follows the center of your palm in real time.</p></div>
        <div className="control-card"><div className="control-card-top"><div className="control-icon"><Hand size={18} /></div><div><strong>PALM POSITION</strong><span>LIVE HAND TELEMETRY</span></div><span className="control-card-status"><span className="mini-dot" /> {handDetected ? "TRACKING" : "IDLE"}</span></div><div className="telemetry-grid"><div className="telemetry"><span>OPENNESS</span><strong>{Math.round(openScore * 100)}<small>%</small></strong><div className="telemetry-bar"><i style={{ width: `${openScore * 100}%` }} /></div></div><div className="telemetry"><span>PITCH SHIFT</span><strong>{pitchLabel}</strong><div className="telemetry-bar"><i style={{ width: `${handX * 100}%` }} /></div></div><div className="telemetry"><span>COLOR / AIR</span><strong>{brightnessLabel}</strong><div className="telemetry-bar"><i style={{ width: `${(1 - handY) * 100}%` }} /></div></div></div></div>
        <div className="control-card mix-card"><div className="control-card-top"><div className="control-icon"><Sparkles size={18} /></div><div><strong>VOICE CHARACTER</strong><span>SHAPE THE RETURN</span></div></div><div className="range-control"><div className="range-label"><span>VOCODER MIX</span><strong>{mix}%</strong></div><input type="range" min="0" max="100" value={mix} onChange={(event) => setMix(Number(event.target.value))} /></div><div className="range-control"><div className="range-label"><span>ANALOG DRIVE</span><strong>{drive}%</strong></div><input type="range" min="0" max="100" value={drive} onChange={(event) => setDrive(Number(event.target.value))} /></div></div>
      </section>

      <footer className="footer"><span>BUILT FOR LOUD IDEAS</span><span className="footer-center"><Headphones size={14} /> HEADPHONES RECOMMENDED</span><span><Mic2 size={14} /> LOCAL AUDIO ONLY</span></footer>
    </main>
  );
}
