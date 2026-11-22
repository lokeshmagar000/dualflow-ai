import Link from "next/link";
import { api, type ChannelInfo } from "@/lib/api";
import { callbackUrl, type ConnectPlatform } from "@/lib/connect";
import { ApiError, Card, LangBadge, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { CopyButton } from "@/components/CopyButton";
import { AppKeysForm, TestButton, UploadSwitch } from "@/components/ConnectControls";
import { disconnect, swapMetaLanguages } from "./actions";

const PLATFORM: Record<string, string> = { YOUTUBE: "YouTube", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };
const GUIDE = "docs/easy-auto-upload.md";

interface ConnectStatus {
  keyReady: boolean;
  keySource: string | null;
  switch: "off" | "practice" | "approval" | "auto" | null;
  apps: Record<ConnectPlatform, { saved: boolean; idHint: string | null; configId: string | null; problem: string | null }>;
  channels: { id: string; platform: string; language: "ne" | "en"; name: string; connected: boolean }[];
}

// Connect your accounts with one click, choose Auto upload, and see how many videos went where.
export default async function ChannelsPage({ searchParams }: { searchParams: Promise<{ connect?: string; msg?: string }> }) {
  const q = await searchParams;
  let status: ConnectStatus;
  let channels: ChannelInfo[];
  try {
    [status, channels] = await Promise.all([api<ConnectStatus>("/connect"), api<ChannelInfo[]>("/channels")]);
  } catch (e) {
    return (<><PageHeader title="Channels" /><ApiError error={e} /></>);
  }
  channels = Array.isArray(channels) ? channels : [];
  const anyConnected = status.channels.some((c) => c.connected);
  const find = (platform: string, lang: "ne" | "en") => status.channels.find((c) => c.platform === platform && c.language === lang && c.connected);
  const [ytBack, metaBack, ttBack] = await Promise.all([callbackUrl("youtube"), callbackUrl("meta"), callbackUrl("tiktok")]);

  return (
    <>
      <PageHeader
        title="Channels"
        subtitle={<>Connect each account once with a button. Then turn on <b>Auto upload</b> and new videos go up by themselves. Step-by-step help: <code>{GUIDE}</code>.</>}
      />

      {q.connect === "ok" && <Notice tone="ok" title="Connected 🎉">{q.msg}</Notice>}
      {q.connect === "error" && <Notice tone="bad" title="Not connected">{q.msg}</Notice>}
      {!status.keyReady && (
        <Notice tone="warn" title="One setting is missing on Render">
          To keep tokens safe, the dashboard locks them with your <code>R2_SECRET_ACCESS_KEY</code>. Add it on Render (dualflow-web, Environment)
          with the same value as in GitHub Secrets, then come back.
        </Notice>
      )}

      <Card title="1. Auto upload" className="mb-4">
        <UploadSwitch current={status.switch} />
        <p className="mt-3 text-sm text-fg3">
          Uploads happen at <b>7:00 AM, 12:30 PM and 7:00 PM</b> Nepal time, one video per channel each time.
          {status.switch === null && " You have not picked yet, so the old GitHub settings decide (they are Off unless you changed them)."}
          {" "}Start with <b>Practice</b>, look at the next run, then pick <b>Fully automatic</b>.
        </p>
      </Card>

      <SectionTitle>2. Connect your accounts</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <PlatformCard
          title="YouTube"
          platform="youtube"
          app={status.apps.youtube}
          back={ytBack}
          appHelp={<>From <b>console.cloud.google.com</b> → Google Auth Platform → Clients → your <b>Web application</b> client.</>}
          idLabel="Client ID"
          secretLabel="Client secret"
          rows={(["ne", "en"] as const).map((l) => ({ lang: l, ch: find("YOUTUBE", l), connectHref: `/connect/youtube/start?lang=${l}` }))}
          rule="Until Google approves your free audit, YouTube keeps API uploads private. Send the audit form early (guide, part 4)."
          tip="When Google asks which account, pick the matching channel (Namaste Facts or Namaste Facts नेपाली), not your own name."
        />
        <PlatformCard
          title="Facebook + Instagram"
          platform="meta"
          app={status.apps.meta}
          back={metaBack}
          appHelp={<>From <b>developers.facebook.com</b> → My Apps → DualFlow → App settings → <b>Basic</b>.</>}
          idLabel="App ID"
          secretLabel="App secret"
          withConfigId
          oneButton={{ label: "Connect Facebook + Instagram", href: "/connect/meta/start" }}
          rows={(["ne", "en"] as const).map((l) => ({ lang: l, ch: find("FACEBOOK", l), extra: find("INSTAGRAM", l) }))}
          rule="One click connects both Pages and the Instagram account linked to each. Switch the Meta app to Live so everyone can see the posts."
          tip="In the Facebook window, choose both Pages (or “all current and future Pages”)."
          footer={status.channels.some((c) => (c.platform === "FACEBOOK" || c.platform === "INSTAGRAM") && c.connected) ? (
            <ActionButton action={swapMetaLanguages} label="Wrong language? Swap Nepali ↔ English" pendingLabel="Swapping…" className="btn btn-sm btn-subtle" />
          ) : null}
        />
        <PlatformCard
          title="TikTok"
          platform="tiktok"
          app={status.apps.tiktok}
          back={ttBack}
          appHelp={<>From <b>developers.tiktok.com</b> → Manage apps → DualFlow (top of the app page).</>}
          idLabel="Client key"
          secretLabel="Client secret"
          rows={(["ne", "en"] as const).map((l) => ({ lang: l, ch: find("TIKTOK", l), connectHref: `/connect/tiktok/start?lang=${l}` }))}
          rule="TikTok must approve your app first. Until its audit, posts are private (only you see them). Do TikTok last."
          tip="TikTok signs in with the account open in this browser. Switch to the right TikTok account on tiktok.com before each Connect."
        />
      </div>

      <SectionTitle>3. Check</SectionTitle>
      <Card className="mb-4">
        <p className="mb-3 text-fg2">Asks every connected channel &quot;who are you?&quot;. It uploads nothing.</p>
        <TestButton disabled={!anyConnected} />
      </Card>

      {channels.length > 0 && (
        <>
          <SectionTitle>Uploads per channel</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {channels.map((c) => {
              const n = (k: string) => c.counts?.[k] ?? 0;
              return (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-fg3">{PLATFORM[c.platform] ?? c.platform}</p>
                    </div>
                    <LangBadge lang={c.language} long />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 rounded-md bg-subtle p-3 text-center">
                    {([["Uploaded", "PUBLISHED"], ["In queue", "SCHEDULED"], ["Approval", "READY"], ["Failed", "FAILED"]] as const).map(([label, key]) => (
                      <div key={key}>
                        <dt className="text-xs text-fg3">{label}</dt>
                        <dd className={`text-lg font-semibold tabular-nums ${key === "FAILED" && n(key) > 0 ? "text-bad" : ""}`}>{n(key)}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-fg3">See every upload and its time on the <Link href="/calendar" className="underline">Upload queue</Link>.</p>
        </>
      )}
    </>
  );
}

type Row = { lang: "ne" | "en"; ch?: { name: string }; extra?: { name: string }; connectHref?: string };

function PlatformCard(props: {
  title: string;
  platform: ConnectPlatform;
  app: ConnectStatus["apps"][ConnectPlatform];
  back: string;
  appHelp: React.ReactNode;
  idLabel: string;
  secretLabel: string;
  withConfigId?: boolean;
  rows: Row[];
  oneButton?: { label: string; href: string };
  rule: string;
  tip: string;
  footer?: React.ReactNode;
}) {
  const { app } = props;
  return (
    <Card title={props.title}>
      <ol className="space-y-4">
        <li>
          <details open={!app.saved} className="group">
            <summary className="cursor-pointer list-none font-semibold">
              <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
              Step A: your app keys {app.saved ? <span className="badge ml-1 bg-ok-tint text-ok">saved {app.idHint}</span> : <span className="badge ml-1 bg-subtle2 text-fg2">not yet</span>}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-sm text-fg2">{props.appHelp}</p>
              <div className="rounded-md bg-subtle p-2.5">
                <p className="text-xs font-semibold text-fg2">Return address: paste this once in your app&apos;s settings</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-xs">{props.back}</code>
                  <CopyButton text={props.back} />
                </div>
              </div>
              <AppKeysForm platform={props.platform} saved={app.saved} idLabel={props.idLabel} secretLabel={props.secretLabel} withConfigId={props.withConfigId} configId={app.configId} />
              {app.problem && <p className="text-xs text-bad">{app.problem}</p>}
            </div>
          </details>
        </li>
        <li>
          <p className="mb-2 font-semibold">Step B: connect</p>
          <ul className="space-y-2">
            {props.rows.map((r) => (
              <li key={r.lang} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-stroke p-2.5">
                <div className="min-w-0">
                  <LangBadge lang={r.lang} />
                  <p className={`mt-1 text-sm ${r.ch ? "font-semibold" : "text-fg3"}`}>
                    {r.ch ? <>✓ {r.ch.name}</> : "Not connected"}
                  </p>
                  {props.oneButton && <p className="text-xs text-fg3">{r.extra ? `Instagram ✓ ${r.extra.name}` : r.ch ? "Instagram: not linked to this Page" : ""}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.connectHref && (
                    <a href={app.saved ? r.connectHref : undefined} aria-disabled={!app.saved} className={`btn btn-sm ${r.ch ? "" : "btn-primary"}`}>
                      {r.ch ? "Reconnect" : "Connect"}
                    </a>
                  )}
                  {r.ch && <ActionButton action={disconnect} fields={{ platform: props.platform, language: r.lang }} label="Remove" pendingLabel="Removing…" className="btn btn-sm btn-subtle" />}
                </div>
              </li>
            ))}
          </ul>
          {props.oneButton && (
            <a href={app.saved ? props.oneButton.href : undefined} aria-disabled={!app.saved} className="btn btn-primary mt-3 w-full justify-center">
              {props.rows.some((r) => r.ch) ? "Reconnect Facebook + Instagram" : props.oneButton.label}
            </a>
          )}
          {!app.saved && <p className="mt-2 text-xs text-fg3">Save the app keys first (step A).</p>}
          <p className="mt-2 text-xs text-fg3">💡 {props.tip}</p>
        </li>
      </ol>
      <p className="mt-4 border-t border-stroke pt-3 text-xs text-fg3">{props.rule}</p>
      {props.footer && <div className="mt-2">{props.footer}</div>}
    </Card>
  );
}
