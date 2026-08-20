import { Conversation } from "@elevenlabs/client";

const state = {
  config: {},
  conversation: null,
  wakeRecognition: null,
  wakeStream: null,
  wakeContext: null,
  wakeAnalyser: null,
  clapFrame: null,
  lastClapAt: 0,
  clapCount: 0,
  pendingCommand: null,
  speaking: false,
  muted: false,
};

const $ = (selector) => document.querySelector(selector);
const messages = $("#messages");
const orb = $(".orb");

function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
function setBar(selector, value) { const node = $(selector); if (node) node.style.width = `${Math.max(4, Math.min(100, value))}%`; }
function addMessage(label, text, kind = "system-message") {
  const item = document.createElement("div");
  item.className = `message ${kind}`;
  item.innerHTML = `<span class="message-label">${escapeHtml(label)}</span><p>${escapeHtml(text)}</p>`;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function setMode(mode, hint = "") {
  orb.classList.remove("listening", "connected", "speaking");
  if (mode === "listening") orb.classList.add("listening");
  if (mode === "connected") orb.classList.add("connected");
  if (mode === "speaking") orb.classList.add("speaking");
  setText("#orbState", mode === "listening" ? "LISTENING FOR WAKE" : mode === "connected" ? "JARVIS ONLINE" : mode === "speaking" ? "SPEAKING" : mode.toUpperCase());
  setText("#orbHint", hint || (mode === "listening" ? "say “wake up jarvis” or clap twice" : mode === "connected" ? "conversation mode active" : ""));
  setText("#modeLink", mode.toUpperCase());
  setBar("#modeBar", mode === "speaking" ? 94 : mode === "connected" ? 80 : 48);
}
function setConnection(isLive) {
  const label = $("#connectionLabel");
  label.classList.toggle("live", isLive);
  label.innerHTML = `<i></i> ${isLive ? "ELEVENLABS LIVE" : "STANDBY"}`;
  setText("#voiceLink", isLive ? "REALTIME LINK" : "LOCAL WAKE");
  setBar("#voiceBar", isLive ? 94 : 26);
}

async function loadConfig() {
  state.config = await window.jarvis.getConfig();
  setText("#betonLink", "READY");
  setBar("#betonBar", 78);
  if (!state.config.agentId) {
    setText("#betonLink", "READY / VOICE SETUP NEEDED");
    addMessage("SETUP", "Run `jarvis setup` in a terminal to connect an ElevenLabs Agent. Beton is used first for local actions.");
  }
}

function startWakeRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    addMessage("WAKE", "Browser speech recognition is unavailable in this Electron build. Two-clap wake remains active; use the text field as a fallback.");
    return;
  }
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.onresult = (event) => {
    let transcript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
    const lower = transcript.toLowerCase();
    const wakeName = (state.config.wakeName || "jarvis").toLowerCase();
    if (lower.includes(`wake up ${wakeName}`) || lower.includes(`hey ${wakeName}`) || lower.trim() === wakeName) {
      addMessage("WAKE", `Wake phrase heard. Connecting to ${wakeName}.`);
      connectConversation();
    }
    if (lower.includes("mute")) muteAssistant();
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech") addMessage("WAKE", `Wake listener: ${event.error}. Two-clap detection is still active.`);
  };
  recognition.onend = () => { if (!state.muted) { try { recognition.start(); } catch {} } };
  state.wakeRecognition = recognition;
  try { recognition.start(); } catch {}
}

async function startClapDetection() {
  try {
    state.wakeStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
    state.wakeContext = new AudioContext();
    const source = state.wakeContext.createMediaStreamSource(state.wakeStream);
    state.wakeAnalyser = state.wakeContext.createAnalyser();
    state.wakeAnalyser.fftSize = 256;
    state.wakeAnalyser.smoothingTimeConstant = 0.12;
    source.connect(state.wakeAnalyser);
    const data = new Uint8Array(state.wakeAnalyser.fftSize);
    const scan = () => {
      state.wakeAnalyser.getByteTimeDomainData(data);
      let energy = 0;
      for (const sample of data) energy += Math.abs(sample - 128);
      const average = energy / data.length / 128;
      const now = performance.now();
      if (average > 0.35 && now - state.lastClapAt > 90) {
        const interval = state.lastClapAt ? now - state.lastClapAt : Infinity;
        state.clapCount = interval < 700 ? state.clapCount + 1 : 1;
        state.lastClapAt = now;
        if (state.clapCount >= 2) {
          state.clapCount = 0;
          addMessage("WAKE", "Two-clap pattern detected. Connecting.");
          connectConversation();
        }
      }
      state.clapFrame = requestAnimationFrame(scan);
    };
    scan();
  } catch (error) {
    addMessage("WAKE", `Microphone wake detection unavailable: ${error.message || error}`);
  }
}

async function connectConversation() {
  if (state.conversation) return;
  try {
    setMode("connected", "opening realtime voice link");
    setConnection(false);
    const session = await window.jarvis.getSignedUrl();
    if (!session.agentId && !session.signedUrl) throw new Error("No ElevenLabs Agent ID configured. Run `jarvis setup` first.");
    const options = {
      ...(session.signedUrl ? { signedUrl: session.signedUrl } : { agentId: session.agentId }),
      onConnect: ({ conversationId }) => {
        state.conversationId = conversationId;
        setConnection(true);
        setMode("connected");
        addMessage("JARVIS", "Online. I’m listening.", "assistant-message");
      },
      onDisconnect: () => {
        state.conversation = null;
        setConnection(false);
        setMode("listening");
        addMessage("LINK", "Voice session ended. Wake listener remains active.");
      },
      onMessage: (message) => {
        const text = typeof message === "string" ? message : message?.message || message?.text || "";
        if (text) addMessage(message?.source === "user" ? "YOU" : "JARVIS", text, message?.source === "user" ? "user-message" : "assistant-message");
      },
      onError: (error) => addMessage("ELEVENLABS", String(error), "system-message"),
    };
    state.conversation = await Conversation.startSession(options);
    setMode("connected");
  } catch (error) {
    state.conversation = null;
    setConnection(false);
    setMode("listening");
    addMessage("VOICE", `Could not start realtime voice: ${error.message || error}. Run \`jarvis setup\` and confirm the Agent ID/API key.`);
  }
}

async function stopConversation() {
  if (state.conversation) {
    await state.conversation.endSession();
    state.conversation = null;
  }
  setConnection(false);
  setMode("listening");
}
function muteAssistant() {
  state.muted = true;
  if (state.conversation) stopConversation();
  addMessage("MUTE", "Voice link muted. Use the orb or MUTE again to resume wake listening.");
  setMode("listening", "muted — press MUTE to resume");
}

async function runCommand(command, confirmed = false) {
  if (!command.trim()) return;
  addMessage("YOU", command, "user-message");
  setText("#commandInput", "");
  const result = await window.jarvis.runAction({ command, confirmed });
  if (result.needsConfirmation) {
    state.pendingCommand = command;
    setText("#confirmationText", result.preview);
    $("#confirmationCard").classList.remove("hidden");
    addMessage("GUARD", "This action needs your confirmation before it runs.");
    return;
  }
  if (result.ok) addMessage(result.executor.toUpperCase(), result.stdout || "Action completed.", "assistant-message");
  else addMessage(result.executor ? result.executor.toUpperCase() : "ERROR", result.error || result.stderr || "The action did not complete.");
}

$("#sendButton").addEventListener("click", () => runCommand($("#commandInput").value));
$("#commandInput").addEventListener("keydown", (event) => { if (event.key === "Enter") runCommand(event.currentTarget.value); });
$("#confirmAction").addEventListener("click", () => { const command = state.pendingCommand; state.pendingCommand = null; $("#confirmationCard").classList.add("hidden"); if (command) runCommand(command, true); });
$("#cancelAction").addEventListener("click", () => { state.pendingCommand = null; $("#confirmationCard").classList.add("hidden"); addMessage("GUARD", "Action cancelled."); });
$("#muteButton").addEventListener("click", () => { if (state.muted) { state.muted = false; startWakeRecognition(); addMessage("WAKE", "Wake listener resumed."); } else muteAssistant(); });
$("#minimizeButton").addEventListener("click", () => { window.jarvis.setShellOpen(false); window.jarvis.hide(); });
$("#settingsButton").addEventListener("click", async () => {
  const agentId = window.prompt("ElevenLabs Agent ID", state.config.agentId || "");
  if (agentId === null) return;
  state.config = await window.jarvis.saveConfig({ agentId });
  addMessage("SETUP", "Agent ID saved. Reconnect the voice link to use it.");
});
document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => runCommand(button.dataset.command)));
window.jarvis.onMute(() => muteAssistant());

(async () => {
  setMode("listening");
  await loadConfig();
  startWakeRecognition();
  startClapDetection();
})();
