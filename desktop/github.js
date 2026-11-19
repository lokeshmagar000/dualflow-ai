/**
 * Talks to GitHub for the app. Runs in the "main" (back-end) part of the app,
 * so the token never reaches the window you see.
 *
 * Everything here uses the GitHub REST API with YOUR fine-grained token
 * (only this repo, only "Actions" permission).
 */
// DUALFLOW_GITHUB_API is only for testing with a fake GitHub; normally unset.
const API = process.env.DUALFLOW_GITHUB_API || "https://api.github.com";
const WORKFLOW = "pipeline.yml"; // the workflow that makes the videos

function headers(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "dualflow-desktop",
  };
}

/** A friendly error message the window can show. */
class GitHubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function explain(status, body) {
  if (status === 401) return "GitHub did not accept the token. Make a new token and save it again in Settings.";
  if (status === 403) return "The token is missing a permission. It needs Actions: Read and write for this repo.";
  if (status === 404) return "GitHub could not find the repo or workflow. Check the repo name in Settings, and that the token can see it.";
  if (status === 422 && /Unexpected inputs/i.test(body)) {
    return "This branch does not know the 'your idea' option yet. Merge the Mac app pull request first, or leave the idea empty.";
  }
  return `GitHub said ${status}: ${body.slice(0, 200)}`;
}

async function call(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(token), ...(init.body ? { "content-type": "application/json" } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new GitHubError(res.status, explain(res.status, await res.text()));
  if (res.status === 204) return null;
  return res.json();
}

/** Check the token: returns the repo's name and if we can see the workflow. */
async function testConnection(token, repo) {
  const r = await call(token, `/repos/${repo}`);
  await call(token, `/repos/${repo}/actions/workflows/${WORKFLOW}`);
  return { name: r.full_name, private: r.private };
}

/**
 * Start the video pipeline now (same as "Run workflow" on GitHub).
 * idea: your own topic (optional). remake: remake the newest video. practice: add the practice story.
 */
async function startRun(token, repo, ref, { idea = "", remake = false, practice = false }) {
  const inputs = {};
  if (idea.trim()) inputs.topic = idea.trim().slice(0, 200);
  if (remake) inputs.remake_latest = "true";
  if (practice) inputs.demo_story = "true";
  await call(token, `/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref, inputs }),
  });
}

/** The newest pipeline runs (newest first). */
async function listRuns(token, repo, count = 15) {
  const data = await call(token, `/repos/${repo}/actions/workflows/${WORKFLOW}/runs?per_page=${count}`);
  return data.workflow_runs.map((r) => ({
    id: r.id,
    number: r.run_number,
    title: r.display_title,
    event: r.event,
    status: r.status, // queued | in_progress | completed
    conclusion: r.conclusion, // success | failure | cancelled | null
    startedAt: r.run_started_at || r.created_at,
    updatedAt: r.updated_at,
    url: r.html_url,
  }));
}

/** For a running run: the name of the step it is doing now. */
async function currentStep(token, repo, runId) {
  const data = await call(token, `/repos/${repo}/actions/runs/${runId}/jobs`);
  for (const job of data.jobs) {
    const step = (job.steps || []).find((s) => s.status === "in_progress");
    if (step) return step.name;
  }
  return null;
}

/** The "videos" download of a finished run, if it still exists (GitHub keeps it 7 days). */
async function videosArtifact(token, repo, runId) {
  const data = await call(token, `/repos/${repo}/actions/runs/${runId}/artifacts`);
  const a = data.artifacts.find((x) => x.name === "videos" && !x.expired);
  return a ? { id: a.id, sizeBytes: a.size_in_bytes } : null;
}

/** Download the videos zip. Returns the zip as a Buffer. */
async function downloadArtifact(token, repo, artifactId) {
  // GitHub answers with a short-lived link to the real file. We follow it
  // ourselves, WITHOUT the token, so the token only ever goes to GitHub.
  const first = await fetch(`${API}/repos/${repo}/actions/artifacts/${artifactId}/zip`, {
    headers: headers(token),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (first.status !== 302) throw new GitHubError(first.status, explain(first.status, await first.text()));
  const file = await fetch(first.headers.get("location"), { signal: AbortSignal.timeout(10 * 60_000) });
  if (!file.ok) throw new GitHubError(file.status, `Download failed (${file.status}).`);
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Estimate this month's GitHub Actions minutes (all workflows).
 * Private repos get 2,000 free minutes a month; Mac machines count 10x.
 */
async function minutesThisMonth(token, repo) {
  const now = new Date();
  const since = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  let page = 1;
  let minutes = 0;
  let runs = 0;
  for (;;) {
    const data = await call(token, `/repos/${repo}/actions/runs?per_page=100&page=${page}&created=>=${since}`);
    for (const r of data.workflow_runs) {
      if (!r.run_started_at) continue;
      const ms = new Date(r.updated_at) - new Date(r.run_started_at);
      // GitHub rounds every job up to a whole minute.
      const m = Math.max(1, Math.ceil(ms / 60_000));
      const isMac = /desktop|mac/i.test(r.name || "");
      minutes += isMac ? m * 10 : m;
      runs += 1;
    }
    if (data.workflow_runs.length < 100 || page >= 10) break;
    page += 1;
  }
  return { minutes, runs, since };
}

module.exports = { testConnection, startRun, listRuns, currentStep, videosArtifact, downloadArtifact, minutesThisMonth };
