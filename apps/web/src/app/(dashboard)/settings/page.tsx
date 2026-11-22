import { ApiProblem, api, oneServerMode, problemText, storageSetup, type AutoStatus, type BulkSetup, type StorageCheck } from "@/lib/api";
import { Card, Notice, PageHeader, STATE_TEXT } from "@/components/ui";
import { insideApiStatus } from "@/lib/inside-api";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { IconCheck, IconOpen, IconWarning } from "@/components/icons";

const REPO = "https://github.com/lokeshmagar000/dualflow-ai/blob/main/docs";

/**
 * Settings: is everything connected, the look (light/dark), and links to the guides.
 * The connection check runs each time you open this page.
 */
export default async function SettingsPage() {
  const oneServer = oneServerMode();
  const started = Date.now();
  let apiOk = true;
  let apiProblem = "";
  let blocked = false;
  let auto: AutoStatus | null = null;
  let bulk: BulkSetup | null = null;
  let storageCheck: StorageCheck | null = null;
  try {
    [auto, bulk, storageCheck] = await Promise.all([
      api<AutoStatus>("/auto"),
      api<BulkSetup>("/bulk-uploads/setup").catch(() => null),
      // A real test: the server that makes the download links asks Cloudflare R2 (older APIs: null).
      api<StorageCheck>("/storage/check").catch(() => null),
    ]);
  } catch (e) {
    apiOk = false;
    apiProblem = problemText(e);
    blocked = e instanceof ApiProblem && e.kind === "blocked";
  }
  const ms = Date.now() - started;
  const inside = insideApiStatus();
  const storage = storageSetup();
  const storageOk = storage.driver === "r2" && storage.missing.length === 0;
  const storageText = storageOk
    ? "Cloudflare R2 (Download and Delete work)."
    : storage.missing.length > 0
      ? `Not connected, so Download cannot find your videos. Add these on Render (dualflow-web, Environment): ${storage.missing.join(", ")}.`
      : "STORAGE is set to local files. Remove STORAGE on Render (or set it to r2), so your videos in Cloudflare R2 are used.";

  return (
    <>
      <PageHeader title="Settings" subtitle="Check that everything is connected, and choose how the dashboard looks." />

      {!oneServer && (
        <Notice tone={blocked ? "bad" : "warn"} title="Turn on one server mode (recommended, about 5 minutes)"
          action={<a className="btn btn-primary" href={`${REPO}/fix-dashboard-connection.md`} target="_blank" rel="noopener noreferrer">Show me the steps <IconOpen className="h-4 w-4" /></a>}>
          Right now the dashboard talks to a second server (dualflow-api) over the internet. Render sometimes blocks that
          (the &quot;error 429, Just a moment&quot; problem), and two free servers both have to wake up. With one server mode the
          API runs inside this dashboard server: faster, and nothing can block it.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Connection">
          <ul className="divide-y divide-stroke">
            <Row ok={oneServer} label="One server mode" text={oneServer ? "On: the API runs inside this server." : "Off: using the separate dualflow-api server."} warnOnly />
            {oneServer && (
              <Row ok={inside.state === "running"} label="Built-in API"
                text={`${STATE_TEXT[inside.state] ?? inside.state}${inside.restarts ? `, restarted ${inside.restarts} time${inside.restarts === 1 ? "" : "s"}` : ""}. Database update: ${inside.migrate}.`}
                warnOnly={inside.state !== "restarting"} />
            )}
            {oneServer && inside.lastError && (
              <li className="py-2.5">
                <p className="font-semibold">Last message from the built-in API</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-subtle p-2 text-xs text-fg2">{inside.lastError.slice(-800)}</pre>
              </li>
            )}
            <Row ok={apiOk} label="API answers" text={apiOk ? `Yes, in ${ms} ms.` : apiProblem} />
            {auto && <Row ok={auto.generateNowAvailable} label="Generate now and Run now" text={auto.generateNowAvailable ? "Ready (GitHub key found)." : "Needs GITHUB_REPO and GITHUB_DISPATCH_TOKEN on Render."} warnOnly />}
            {storageCheck && (
              <Row ok={storageCheck.ok && storageCheck.driver === "r2"} label="Video storage (live test)"
                text={storageCheck.driver !== "r2"
                  ? oneServer && storage.missing.length > 0 ? storageText : "STORAGE is set to local files. Remove STORAGE on Render (or set it to r2), so your videos in Cloudflare R2 are used."
                  : storageCheck.ok ? `${storageCheck.where}: connected, Download works.` : `${storageCheck.problem} (Render -> ${oneServer ? "dualflow-web" : "dualflow-api"} -> Environment)`} />
            )}
            {!storageCheck && oneServer && <Row ok={storageOk} label="Video storage" text={storageText} />}
            {!storageCheck && !oneServer && bulk && <Row ok={bulk.storage === "r2"} label="Video storage" text={bulk.storage === "r2" ? "Cloudflare R2 (downloads work)." : "Local files only. Add the R2 keys on Render."} warnOnly />}
            {auto && <Row ok={!auto.paused} label="Automation" text={auto.paused ? "Paused by the kill switch (Costs & limits)." : "Running."} warnOnly />}
          </ul>
        </Card>

        <Card title="Appearance">
          <p className="mb-3 text-fg2">Light, dark, or follow your phone or computer setting. Saved in this browser.</p>
          <div className="max-w-sm"><ThemeSwitch /></div>
        </Card>

        <Card title="Guides" className="lg:col-span-2">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["fix-dashboard-connection.md", "Fix the dashboard connection (one server mode)"],
              ["faster-dashboard.md", "Make the dashboard faster (keep it awake)"],
              ["automatic-videos.md", "How automatic videos work"],
              ["channel-and-token-guide.md", "Make channels and get upload tokens"],
              ["bulk-upload.md", "Bulk upload setup"],
              ["put-dashboard-online.md", "Put the dashboard online on Render"],
            ].map(([file, label]) => (
              <li key={file}>
                <a href={`${REPO}/${file}`} target="_blank" rel="noopener noreferrer"
                  className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-stroke px-3 py-2 hover:bg-hover">
                  {label} <IconOpen className="h-4 w-4 shrink-0 text-fg3" />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function Row({ ok, label, text, warnOnly }: { ok: boolean; label: string; text: string; warnOnly?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? <IconCheck className="mt-0.5 shrink-0 text-ok" /> : <IconWarning className={`mt-0.5 shrink-0 ${warnOnly ? "text-warn" : "text-bad"}`} />}
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="break-words text-fg3">{text}</p>
      </div>
    </li>
  );
}
