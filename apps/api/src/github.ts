/**
 * "Run now": start the GitHub Actions pipeline run right away,
 * instead of waiting for the next scheduled run (2 AM and 4 AM Nepal time).
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

export function githubRunConfigured(): boolean {
  return Boolean(process.env.GITHUB_REPO && process.env.GITHUB_DISPATCH_TOKEN);
}

export async function triggerPipelineRun(workflow = WORKFLOW, inputs?: Record<string, string>): Promise<{ started: boolean; message: string }> {
  if (!githubRunConfigured()) {
    return { started: false, message: "Run now is not set up (GITHUB_REPO and GITHUB_DISPATCH_TOKEN). The next scheduled run will do it." };
  }
  const repo = process.env.GITHUB_REPO!;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { started: false, message: "GITHUB_REPO must look like owner/name." };
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
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

/** Start a run if possible, but never let a GitHub problem break the request. */
export async function triggerQuietly(log: { warn: (msg: string) => void }) {
  if (!githubRunConfigured() || (process.env.AUTO_RUN_ON_NEW_STORY ?? "true") === "false") return;
  try {
    const r = await triggerPipelineRun();
    if (!r.started) log.warn(r.message);
  } catch (err) {
    log.warn(`Could not start the GitHub run: ${(err as Error).message}`);
  }
}

/**
 * Start the small "Upload now" run. Returns a sentence for the page;
 * a GitHub problem never breaks the request (the next Pipeline run uploads it anyway).
 */
export async function startUploadRun(log: { warn: (msg: string) => void }): Promise<string> {
  if (!githubRunConfigured()) return "Upload now is not set up on Render (GITHUB_REPO and GITHUB_DISPATCH_TOKEN), so the next Pipeline run (2 AM and 4 AM Nepal time) will upload it.";
  try {
    const r = await triggerPipelineRun(UPLOAD_WORKFLOW);
    if (!r.started) log.warn(r.message);
    return r.started ? r.message : `Could not start the upload run (${r.message}). The next Pipeline run will upload it.`;
  } catch (err) {
    log.warn(`Could not start the upload run: ${(err as Error).message}`);
    return "Could not reach GitHub. The next Pipeline run will upload it.";
  }
}
