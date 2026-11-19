/**
 * The bridge between the window and main.js.
 * The window gets ONLY these functions (window.dualflow.*). It never sees the token.
 */
const { contextBridge, ipcRenderer } = require("electron");

const call = (name, ...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld("dualflow", {
  getSettings: () => call("settings:get"),
  saveSettings: (s) => call("settings:save", s),
  saveToken: (t) => call("token:save", t),
  deleteToken: () => call("token:delete"),
  testGitHub: () => call("github:test"),
  startRun: (opts) => call("runs:start", opts),
  listRuns: () => call("runs:list"),
  downloadVideos: (runId, runNumber, artifactId) => call("runs:download", runId, runNumber, artifactId),
  minutesThisMonth: () => call("usage:minutes"),
  listVideos: () => call("videos:list"),
  openVideo: (p) => call("videos:open", p),
  revealVideo: (p) => call("videos:reveal", p),
  openUrl: (u) => call("open:url", u),
  openDashboard: () => call("dashboard:open"),
});
