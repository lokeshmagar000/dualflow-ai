/**
 * "Run now": start the GitHub Actions pipeline run right away,
 * instead of waiting for the next scheduled run (about 1-2 AM Nepal time).
 *
 * Settings (on Render, never in code):
 *   GITHUB_REPO            e.g. "lokeshmagar000/dualflow-ai"
 *   GITHUB_DISPATCH_TOKEN  a fine-grained GitHub token for ONLY this repo,
 *                          with "Actions: Read and write" permission
 *   GITHUB_REF             branch to run (default "main")
 * Without them, "Run now" is off and the scheduled runs (or your local worker) do the work.
 */
const WORKFLOW = "pipeline.yml";
/** The small "Upload now" run (.github/workflows/upload.yml): uploads only, done in a few minutes. */
export const UPLOAD_WORKFLOW = "upload.yml";

/**
 * Which GitHub repo to start runs in.
 * GITHUB_REPO wins; otherwise it is found by itself from the host:
 * Vercel gives VERCEL_GIT_REPO_OWNER + VERCEL_GIT_REPO_SLUG, Render gives RENDER_GIT_REPO_SLUG.
 * So on Vercel only the token (GITHUB_DISPATCH_TOKEN) has to be added by hand.
 */
export function githubRepo(): string | undefined {
  const own = process.env.GITHUB_REPO?.trim();
  if (own) return own;
  const { VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: slug, RENDER_GIT_REPO_SLUG: render } = process.env;
  if (owner && slug) return `${owner}/${slug}`;
  if (render && render.includes("/")) return render;
  return undefined;
}

/** The repo's Pipeline page on GitHub (for the "start it on GitHub" fallback link). */
export function pipelinePageUrl(): string {
  return `https://github.com/${githubRepo() ?? "lokeshmagar000/dualflow-ai"}/actions/workflows/${WORKFLOW}`;
}

export function githubRunConfigured(): boolean {
  return Boolean(githubRepo() && process.env.GITHUB_DISPATCH_TOKEN?.trim());
}

export async function triggerPipelineRun(workflow = WORKFLOW, inputs?: Record<string, string>): Promise<{ started: boolean; message: string }> {
  if (!githubRunConfigured()) {
    return { started: false, message: "Run now is not set up (GITHUB_REPO and GITHUB_DISPATCH_TOKEN). The next scheduled run will do it." };
  }
  const repo = githubRepo()!;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { started: false, message: "GITHUB_REPO must look like owner/name." };
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN!.trim()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "dualflow-ai",
    },
    body: JSON.stringify({ ref: process.env.GITHUB_REF || "main", ...(inputs ? { inputs } : {}) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204) {
    const message = workflow === WORKFLOW ? "Started. Videos will be ready in about 10-15 minutes." : "Started. Uploads take about 2-5 minutes.";
    return { started: true, message };
  }
  return { started: false, message: `GitHub said ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

/** The newest Pipeline runs (status: "queued", "in_progress", "completed", ...). Needs "Actions: Read". */
export async function latestPipelineRuns(count = 5): Promise<{ status: string; created_at: string }[]> {
  const repo = githubRepo()!;
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/runs?per_page=${count}`, {
    headers: {
      authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN!.trim()}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "dualflow-ai",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status} when listing runs`);
  const data = (await res.json()) as { workflow_runs?: { status: string; created_at: string }[] };
  return data.workflow_runs ?? [];
}

/**
 * Start a run if possible, but never let a GitHub problem break the request.
 * Returns what happened, so the page can SAY it when the run did not start
 * (before, a missing or expired GitHub key failed silently and videos waited for the night run).
 */
export async function triggerQuietly(log: { warn: (msg: string) => void }): Promise<{ started: boolean; message: string }> {
  if ((process.env.AUTO_RUN_ON_NEW_STORY ?? "true") === "false") return { started: false, message: "Starting at once is turned off (AUTO_RUN_ON_NEW_STORY=false). The next scheduled run makes it." };
  if (!githubRunConfigured()) {
    const message = "Saved, but the dashboard cannot start GitHub by itself (GITHUB_REPO and GITHUB_DISPATCH_TOKEN are missing on the dashboard host). The next scheduled run makes it, or press Run workflow on GitHub (Actions, Pipeline).";
    log.warn(message);
    return { started: false, message };
  }
  try {
    const r = await triggerPipelineRun();
    if (!r.started) {
      log.warn(r.message);
      const hint = /\b(401|403)\b/.test(r.message) ? " The GitHub key (GITHUB_DISPATCH_TOKEN) is wrong or expired: make a new one (docs/faster-dashboard.md) and paste it on the dashboard host." : "";
      return { started: false, message: `Saved, but GitHub did not start: ${r.message}.${hint}` };
    }
    return r;
  } catch (err) {
    const message = `Saved, but GitHub could not be reached: ${(err as Error).message}`;
    log.warn(message);
    return { started: false, message };
  }
}

/**
 * Start the small "Upload now" run. Returns a sentence for the page;
 * a GitHub problem never breaks the request (the next Pipeline run uploads it anyway).
 */
export async function startUploadRun(log: { warn: (msg: string) => void }): Promise<string> {
  if (!githubRunConfigured()) return "Upload now is not set up on Render (GITHUB_REPO and GITHUB_DISPATCH_TOKEN), so it goes up at the next upload time (about 7:05 AM, 12:35 PM or 7:05 PM Nepal time).";
  try {
    const r = await triggerPipelineRun(UPLOAD_WORKFLOW);
    if (!r.started) log.warn(r.message);
    return r.started ? r.message : `Could not start the upload run (${r.message}). It goes up at the next upload time (7:05 AM, 12:35 PM or 7:05 PM Nepal).`;
  } catch (err) {
    log.warn(`Could not start the upload run: ${(err as Error).message}`);
    return "Could not reach GitHub. It goes up at the next upload time (7:05 AM, 12:35 PM or 7:05 PM Nepal).";
  }
}
