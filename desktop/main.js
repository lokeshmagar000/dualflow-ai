/**
 * DualFlow Mac app: the "main" part.
 *
 * An Electron app has two parts:
 *   - main.js (this file): runs like a small server on your Mac. It can read
 *     files, use the Keychain and talk to GitHub.
 *   - renderer/ (the window): HTML + CSS + JavaScript you see and click.
 * They talk through "IPC" messages. preload.js decides which messages the
 * window is allowed to send, so the window can never read your token.
 */
const { app, BrowserWindow, ipcMain, safeStorage, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const gh = require("./github");

const DEFAULTS = {
  repo: "lokeshmagar000/dualflow-ai",
  branch: "main",
  dashboardUrl: "",
};
const VIDEO_DIR = path.join(os.homedir(), "Movies", "DualFlow");

const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
const tokenFile = () => path.join(app.getPath("userData"), "github-token.bin");

// ---------- settings (plain, no secrets) ----------
async function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(await fs.readFile(settingsFile(), "utf8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(input) {
  const s = { ...(await readSettings()) };
  if (typeof input.repo === "string") {
    const repo = input.repo.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Repo must look like owner/name.");
    s.repo = repo;
  }
  if (typeof input.branch === "string") {
    const branch = input.branch.trim();
    if (!/^[\w./-]+$/.test(branch)) throw new Error("Branch name has strange characters.");
    s.branch = branch;
  }
  if (typeof input.dashboardUrl === "string") {
    const u = input.dashboardUrl.trim();
    if (u && !/^https:\/\//.test(u)) throw new Error("The dashboard address must start with https://");
    s.dashboardUrl = u;
  }
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(s, null, 2));
  return s;
}

// ---------- the token, locked with the macOS Keychain ----------
// safeStorage encrypts the token with a secret key that macOS keeps in your
// Keychain ("DualFlow Safe Storage"). The file on disk is unreadable without it.
async function saveToken(token) {
  token = String(token || "").trim();
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) {
    throw new Error("That does not look like a GitHub token (it starts with github_pat_).");
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("The Keychain is not available, so the token was not saved.");
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(tokenFile(), safeStorage.encryptString(token), { mode: 0o600 });
}

async function readToken() {
  try {
    return safeStorage.decryptString(await fs.readFile(tokenFile()));
  } catch {
    return null;
  }
}

async function needToken() {
  const t = await readToken();
  if (!t) throw new Error("Add your GitHub token in Settings first.");
  return t;
}

// ---------- downloaded videos on this Mac ----------
async function localVideos() {
  let folders = [];
  try {
    folders = await fs.readdir(VIDEO_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const f of folders.filter((d) => d.isDirectory())) {
    const dir = path.join(VIDEO_DIR, f.name);
    const files = await fs.readdir(dir);
    for (const name of files.filter((n) => n.endsWith(".mp4"))) {
      const full = path.join(dir, name);
      const thumb = full.replace(/\.mp4$/, ".jpg");
      const hasThumb = files.includes(path.basename(thumb));
      const stat = await fs.stat(full);
      out.push({
        run: f.name,
        name: name.replace(/\.mp4$/, ""),
        path: full,
        url: pathToFileURL(full).href,
        thumbUrl: hasThumb ? pathToFileURL(thumb).href : null,
        language: /-ne$/.test(name.replace(/\.mp4$/, "")) ? "Nepali" : /-en$/.test(name.replace(/\.mp4$/, "")) ? "English" : "",
        sizeMb: Math.round((stat.size / 1e6) * 10) / 10,
        time: stat.mtimeMs,
      });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

function unzip(zipPath, dest) {
  // "ditto" comes with every Mac and can unpack zip files.
  return new Promise((resolve, reject) => {
    const [cmd, args] =
      process.platform === "darwin" ? ["/usr/bin/ditto", ["-x", "-k", zipPath, dest]] : ["unzip", ["-o", "-q", zipPath, "-d", dest]];
    execFile(cmd, args, (err) => (err ? reject(err) : resolve()));
  });
}

/** Only allow opening files inside ~/Movies/DualFlow. */
function insideVideoDir(p) {
  const rel = path.relative(VIDEO_DIR, path.resolve(String(p)));
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

// ---------- messages from the window ----------
function handle(name, fn) {
  // Wrap every handler so errors come back as { error } instead of crashing.
  ipcMain.handle(name, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

handle("settings:get", async () => ({ ...(await readSettings()), hasToken: Boolean(await readToken()), videoDir: VIDEO_DIR }));
handle("settings:save", (input) => saveSettings(input || {}));
handle("token:save", async (token) => {
  await saveToken(token);
  return true;
});
handle("token:delete", async () => {
  await fs.rm(tokenFile(), { force: true });
  return true;
});
handle("github:test", async () => {
  const s = await readSettings();
  return gh.testConnection(await needToken(), s.repo);
});
handle("runs:start", async (opts) => {
  const s = await readSettings();
  await gh.startRun(await needToken(), s.repo, s.branch, opts || {});
  return true;
});
handle("runs:list", async () => {
  const s = await readSettings();
  const token = await needToken();
  const runs = await gh.listRuns(token, s.repo);
  // Add the "now doing" step for running runs, and the download for finished ones.
  await Promise.all(
    runs.map(async (r) => {
      if (r.status !== "completed") r.step = await gh.currentStep(token, s.repo, r.id).catch(() => null);
      else r.videos = await gh.videosArtifact(token, s.repo, r.id).catch(() => null);
    }),
  );
  return runs;
});
handle("runs:download", async (runId, runNumber, artifactId) => {
  const s = await readSettings();
  const zip = await gh.downloadArtifact(await needToken(), s.repo, Number(artifactId));
  const dest = path.join(VIDEO_DIR, `run-${Number(runNumber)}`);
  await fs.mkdir(dest, { recursive: true });
  const tmp = path.join(app.getPath("temp"), `dualflow-${Number(runId)}.zip`);
  await fs.writeFile(tmp, zip);
  try {
    await unzip(tmp, dest);
  } finally {
    await fs.rm(tmp, { force: true });
  }
  return dest;
});
handle("usage:minutes", async () => {
  const s = await readSettings();
  return gh.minutesThisMonth(await needToken(), s.repo);
});
handle("videos:list", () => localVideos());
handle("videos:open", async (p) => {
  if (!insideVideoDir(p)) throw new Error("Not a DualFlow video.");
  const err = await shell.openPath(path.resolve(p));
  if (err) throw new Error(err);
  return true;
});
handle("videos:reveal", async (p) => {
  if (p && insideVideoDir(p)) shell.showItemInFolder(path.resolve(p));
  else {
    await fs.mkdir(VIDEO_DIR, { recursive: true });
    await shell.openPath(VIDEO_DIR);
  }
  return true;
});
handle("open:url", async (url) => {
  const s = await readSettings();
  const ok =
    /^https:\/\/github\.com\//.test(url) ||
    (s.dashboardUrl && String(url).startsWith(s.dashboardUrl));
  if (!ok) throw new Error("Only GitHub and your own dashboard links can be opened.");
  await shell.openExternal(url);
  return true;
});
handle("dashboard:open", async () => {
  const s = await readSettings();
  if (!s.dashboardUrl) throw new Error("Add your web dashboard address in Settings first.");
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "DualFlow web dashboard",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(s.dashboardUrl);
  return true;
});

// ---------- the window ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    title: "DualFlow",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f1115",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // the window cannot touch Node.js
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Links clicked inside the window open in your normal browser (GitHub only).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
