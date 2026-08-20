const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jarvis", {
  getConfig: () => ipcRenderer.invoke("jarvis:get-config"),
  saveConfig: (patch) => ipcRenderer.invoke("jarvis:save-config", patch),
  getSignedUrl: () => ipcRenderer.invoke("jarvis:get-signed-url"),
  runAction: (payload) => ipcRenderer.invoke("jarvis:run-action", payload),
  installBeton: () => ipcRenderer.invoke("jarvis:install-beton"),
  openExternal: (url) => ipcRenderer.invoke("jarvis:open-external", url),
  setShellOpen: (value) => ipcRenderer.send("jarvis:set-shell-open", value),
  hide: () => ipcRenderer.send("jarvis:hide"),
  onMute: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("jarvis:mute", listener);
    return () => ipcRenderer.removeListener("jarvis:mute", listener);
  },
});
