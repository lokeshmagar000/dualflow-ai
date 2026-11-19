/**
 * The window's JavaScript: buttons, lists and refreshing.
 * It asks main.js for everything through window.dualflow (see preload.js).
 */
const $ = (id) => document.getElementById(id);
const api = window.dualflow;

let settings = {};
let runs = [];
let timer = null;

// ---------- little helpers ----------
function toast(msg, kind = "info") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), kind === "error" ? 9000 : 4500);
}

/** Call main.js; show a red message if it fails. Returns the data or null. */
async function ask(promise) {
  const r = await promise;
  if (!r.ok) {
    toast(r.error, "error");
    return null;
  }
  return r.data;
}

/** Make an element safely (text is never read as HTML). */
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c instanceof Node ? c : String(c));
  return e;
}

function ago(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function duration(r) {
  const end = r.status === "completed" ? new Date(r.updatedAt) : new Date();
  const m = Math.max(0, Math.round((end - new Date(r.startedAt)) / 60000));
  return `${m} min`;
}

function badge(r) {
  if (r.status === "queued") return el("span", { class: "badge wait" }, "Waiting");
  if (r.status !== "completed") return el("span", { class: "badge run" }, "Making…");
  if (r.conclusion === "success") return el("span", { class: "badge ok" }, "Done");
  if (r.conclusion === "cancelled") return el("span", { class: "badge wait" }, "Stopped");
  return el("span", { class: "badge bad" }, "Failed");
}

const whoStarted = (e) => ({ schedule: "Automatic", workflow_dispatch: "You", push: "Test" })[e] || e;

// ---------- pages ----------
function show(page) {
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== `page-${page}`));
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  if (page === "videos") loadVideos();
  if (page === "limits") loadLimits();
  if (page === "settings") fillSettings();
}

document.querySelectorAll(".nav").forEach((b) => b.addEventListener("click", () => show(b.dataset.page)));
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-goto]");
  if (go) {
    e.preventDefault();
    show(go.dataset.goto);
  }
  const link = e.target.closest("[data-url]");
  if (link) {
    e.preventDefault();
    ask(api.openUrl(link.dataset.url));
  }
});

// ---------- runs ----------
function runRow(r) {
  const actions = el("div", { class: "actions" });
  if (r.videos) {
    const btn = el("button", { class: "primary small" }, `⬇ Get videos (${Math.round(r.videos.sizeBytes / 1e6)} MB)`);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Downloading…";
      const dest = await ask(api.downloadVideos(r.id, r.number, r.videos.id));
      btn.disabled = false;
      btn.textContent = "⬇ Get videos again";
      if (dest) {
        toast("Videos saved. Opening My videos.", "ok");
        show("videos");
      }
    });
    actions.append(btn);
  } else if (r.status === "completed" && r.conclusion === "success") {
    actions.append(el("span", { class: "muted small" }, "No new video in this run"));
  }
  actions.append(el("button", { class: "ghost small", onclick: () => ask(api.openUrl(r.url)) }, "Details ↗"));
  return el(
    "div",
    { class: "item" },
    el("div", { class: "grow" },
      el("div", {}, badge(r), " ", el("b", {}, r.title || `Run ${r.number}`)),
      el("small", { class: "muted" }, `#${r.number} · ${whoStarted(r.event)} · ${ago(r.startedAt)} · ${duration(r)}`,
        r.step ? ` · now: ${r.step}` : ""),
    ),
    actions,
  );
}

function renderRuns() {
  const list = $("runList");
  list.replaceChildren(...(runs.length ? runs.map(runRow) : [el("p", { class: "muted" }, "No runs yet.")]));

  const active = runs.find((r) => r.status !== "completed");
  const last = runs.find((r) => r.status === "completed");
  const box = $("nowBox");
  if (active) {
    box.replaceChildren(
      el("div", { class: "now" }, el("span", { class: "spinner" }),
        el("div", {}, el("b", {}, active.title || "Making a video"),
          el("div", { class: "muted" }, active.status === "queued" ? "Waiting for a free GitHub machine…" : `Now: ${active.step || "starting"} · ${duration(active)}`))),
    );
  } else if (last) {
    box.replaceChildren(el("div", {}, "Nothing is running. Last run: ", badge(last), " ", el("b", {}, last.title), el("span", { class: "muted" }, ` · ${ago(last.updatedAt)}`)), last.videos ? runRow(last) : "");
  } else {
    box.replaceChildren(el("span", { class: "muted" }, "Nothing has run yet. Press the button above!"));
  }
  schedule(active ? 15000 : 60000);
}

async function loadRuns() {
  if (!settings.hasToken) return;
  const data = await ask(api.listRuns());
  if (data) {
    runs = data;
    renderRuns();
  }
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => !document.hidden && loadRuns(), ms);
}
document.addEventListener("visibilitychange", () => !document.hidden && loadRuns());
$("refreshRuns").addEventListener("click", loadRuns);

$("startBtn").addEventListener("click", async () => {
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "Starting…";
  const ok = await ask(api.startRun({ idea: $("idea").value, remake: $("remake").checked, practice: $("practice").checked }));
  btn.disabled = false;
  btn.textContent = "▶ Make video now";
  if (ok) {
    toast("Started! Videos will be ready in about 10 to 15 minutes.", "ok");
    $("idea").value = "";
    $("remake").checked = $("practice").checked = false;
    setTimeout(loadRuns, 4000); // GitHub needs a few seconds to show the new run
  }
});

// ---------- my videos ----------
async function loadVideos() {
  const vids = (await ask(api.listVideos())) || [];
  $("videoCount").textContent = vids.length;
  const grid = $("videoGrid");
  if (!vids.length) {
    grid.replaceChildren(el("p", { class: "muted" }, "No videos yet. Open Runs and press “Get videos” on a finished run."));
    return;
  }
  grid.replaceChildren(
    ...vids.map((v) =>
      el("div", { class: "card video" },
        v.thumbUrl ? el("img", { src: v.thumbUrl, alt: "", onclick: () => play(v) }) : el("div", { class: "noimg", onclick: () => play(v) }, "▶"),
        el("b", {}, v.name),
        el("small", { class: "muted" }, `${v.language ? v.language + " · " : ""}${v.sizeMb} MB · ${v.run}`),
        el("div", { class: "row" },
          el("button", { class: "primary small", onclick: () => play(v) }, "▶ Play"),
          el("button", { class: "ghost small", onclick: () => ask(api.revealVideo(v.path)) }, "Show in Finder")),
      ),
    ),
  );
}

function play(v) {
  $("playerVideo").src = v.url;
  $("playerName").textContent = v.name;
  $("player").hidden = false;
  $("playerVideo").play();
}
$("closePlayer").addEventListener("click", () => {
  $("playerVideo").pause();
  $("player").hidden = true;
});
$("revealFolder").addEventListener("click", () => ask(api.revealVideo()));

// ---------- free limits ----------
async function loadLimits() {
  loadVideos();
  const today = new Date().toDateString();
  $("runsToday").textContent = runs.filter((r) => new Date(r.startedAt).toDateString() === today).length;
  if (!settings.hasToken) return;
  const m = await ask(api.minutesThisMonth());
  if (!m) return;
  const pct = Math.min(100, Math.round((m.minutes / 2000) * 100));
  $("minUsed").textContent = `${m.minutes} / 2,000`;
  $("minBar").style.width = `${pct}%`;
  $("minBar").className = pct > 85 ? "bad" : pct > 60 ? "warn" : "";
  $("minNote").textContent = `${m.runs} runs since ${m.since} (estimate). ${pct > 85 ? "Almost out! Runs stop when it is used up." : ""}`;
}

// ---------- settings ----------
function fillSettings() {
  $("repo").value = settings.repo || "";
  $("branch").value = settings.branch || "";
  $("dashboardUrl").value = settings.dashboardUrl || "";
  $("tokenState").textContent = settings.hasToken ? "✅ A token is saved." : "No token saved yet.";
  $("videoDir").textContent = settings.videoDir || "";
}

async function reloadSettings() {
  settings = (await ask(api.getSettings())) || {};
  $("needToken").hidden = Boolean(settings.hasToken);
  $("videoDir").textContent = settings.videoDir || "";
  fillSettings();
}

$("saveToken").addEventListener("click", async () => {
  const ok = await ask(api.saveToken($("tokenInput").value));
  $("tokenInput").value = "";
  if (!ok) return;
  await reloadSettings();
  const test = await ask(api.testGitHub());
  if (test) {
    toast(`Token saved and working with ${test.name}.`, "ok");
    loadRuns();
  }
});
$("testToken").addEventListener("click", async () => {
  const t = await ask(api.testGitHub());
  if (t) toast(`Connected to ${t.name}. Everything works.`, "ok");
});
$("deleteToken").addEventListener("click", async () => {
  if (await ask(api.deleteToken())) {
    toast("Token removed from this Mac.");
    await reloadSettings();
  }
});
$("saveSettings").addEventListener("click", async () => {
  const s = await ask(api.saveSettings({ repo: $("repo").value, branch: $("branch").value, dashboardUrl: $("dashboardUrl").value }));
  if (s) {
    toast("Saved.", "ok");
    await reloadSettings();
    loadRuns();
  }
});
$("openDashboard").addEventListener("click", () => ask(api.openDashboard()));

// ---------- start ----------
(async () => {
  await reloadSettings();
  if (!settings.hasToken) {
    $("nowBox").replaceChildren(el("span", { class: "muted" }, "Add your token in Settings to see runs."));
    return;
  }
  loadRuns();
})();
