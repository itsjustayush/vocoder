const { loadConfig } = require("./config");

async function getSignedUrl() {
  const config = loadConfig();
  if (!config.agentId) throw new Error("No ElevenLabs Agent ID configured. Run `jarvis setup` first.");
  if (!config.apiKey) return { agentId: config.agentId, signedUrl: null };
  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  url.searchParams.set("agent_id", config.agentId);
  const response = await fetch(url, { headers: { "xi-api-key": config.apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs signed URL request failed (${response.status}).`);
  const data = await response.json();
  if (!data.signed_url) throw new Error("ElevenLabs returned no signed URL.");
  return { agentId: config.agentId, signedUrl: data.signed_url };
}

module.exports = { getSignedUrl };
