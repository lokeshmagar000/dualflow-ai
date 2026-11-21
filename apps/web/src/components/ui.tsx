/** Small reusable UI pieces, in the Fluent 2 style (see globals.css for the colors). */
import Link from "next/link";
import { ApiProblem, oneServerMode } from "@/lib/api";
import { RetryButton } from "./RetryButton";
import { IconWarning } from "./icons";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-2xl font-semibold leading-8 tracking-tight sm:text-[28px] sm:leading-9">{title}</h1>
        {subtitle && <p className="mt-1 text-fg3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", title, action, flush = false }: { children: React.ReactNode; className?: string; title?: React.ReactNode; action?: React.ReactNode; flush?: boolean }) {
  // flush = no padding, for lists whose rows reach the card's edges.
  return (
    <section className={`card ${flush ? "overflow-hidden" : "p-4 sm:p-5"} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** A heading between groups of cards. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

const STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "waiting to start", cls: "bg-subtle2 text-fg2" },
  GENERATING: { text: "making", cls: "bg-warn-tint text-warn" },
  READY: { text: "ready", cls: "bg-brand-tint text-brand-fg" },
  APPROVED: { text: "approved", cls: "bg-info-tint text-info" },
  SCHEDULED: { text: "in the queue", cls: "bg-info-tint text-info" },
  PUBLISHED: { text: "uploaded", cls: "bg-ok-tint text-ok" },
  FAILED: { text: "failed", cls: "bg-bad-tint text-bad" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { text: status.toLowerCase(), cls: "bg-subtle2 text-fg2" };
  return <span className={`badge ${s.cls}`}>{s.text}</span>;
}

/** Nepali first, then English, everywhere. */
export function nepaliFirst<T extends { language: "ne" | "en" }>(list: T[] | undefined): T[] {
  return [...(list ?? [])].sort((a, b) => (a.language === b.language ? 0 : a.language === "ne" ? -1 : 1));
}

/** "नेपाली" in crimson, "English" in blue: the same colors on every page. */
export function LangBadge({ lang, long = false }: { lang: "ne" | "en"; long?: boolean }) {
  return lang === "ne" ? (
    <span className="badge bg-ne-tint text-ne" lang="ne">{long ? "नेपाली · Nepali" : "नेपाली"}</span>
  ) : (
    <span className="badge bg-en-tint text-en">English</span>
  );
}

/** A coloured note bar (Fluent "MessageBar"). */
export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "ok" | "warn" | "bad"; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }) {
  const cls = {
    info: "bg-brand-tint border-brand/30",
    ok: "bg-ok-tint border-ok-stroke",
    warn: "bg-warn-tint border-warn-stroke",
    bad: "bg-bad-tint border-bad-stroke",
  }[tone];
  const fg = { info: "text-brand-fg", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`mb-4 flex flex-wrap items-start gap-3 rounded-lg border p-3 ${cls}`}>
      <div className="min-w-0 flex-1">
        {title && <p className={`font-semibold ${fg}`}>{title}</p>}
        {children && <div className="mt-0.5 text-fg2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

/** An empty list: says what will appear here and what to do. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6">
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-prose text-fg3">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, note, href, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; tone?: "bad" }) {
  const body = (
    <>
      <p className="text-fg3">{label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-9 tabular-nums">{value}</p>
      {note && <p className={`mt-1 text-xs ${tone === "bad" ? "font-semibold text-bad" : "text-fg3"}`}>{note}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-4 hover:bg-hover">{body}</Link>
  ) : (
    <div className="card p-4">{body}</div>
  );
}

const GUIDE = "https://github.com/lokeshmagar000/dualflow-ai/blob/main/docs/fix-dashboard-connection.md";

/**
 * Shown when a page could not get its data from the API.
 * It explains the problem in plain words and how to fix it, plus a Try again button.
 * The technical text is hidden under "Details" and kept short (no more walls of red code).
 */
export function ApiError({ error }: { error: unknown }) {
  const kind = error instanceof ApiProblem ? error.kind : "server";
  const oneServer = oneServerMode();
  const text: Record<string, { title: string; body: React.ReactNode }> = {
    blocked: {
      title: "Render is blocking the dashboard from reaching the API server",
      body: oneServer ? (
        <>The API answered &quot;too many requests&quot;. Wait a minute and press Try again.</>
      ) : (
        <>
          Your dashboard talks to a second server (dualflow-api) over the internet, and Render&apos;s protection
          sometimes stops that with a &quot;Just a moment...&quot; page (error 429). Waiting a minute can help for a while.
          The lasting fix takes about 5 minutes: turn on <b>one server mode</b>, so the API runs inside the dashboard
          server and nothing can block it.{" "}
          <a className="link" href={GUIDE} target="_blank" rel="noopener noreferrer">Show me the steps</a>
        </>
      ),
    },
    waking: { title: "The API server is waking up", body: <>Free Render servers sleep when nobody uses them. Wait about a minute, then press Try again.</> },
    offline: { title: "The API server is not answering", body: <>It may be starting or redeploying. Wait a minute and press Try again. If it stays like this, check that your servers say Live on Render.</> },
    unauthorized: {
      title: "The dashboard and the API use different keys",
      body: <>On Render, <code>INTERNAL_API_KEY</code> must be the same on dualflow-web and dualflow-api. One server mode avoids this. <a className="link" href={GUIDE} target="_blank" rel="noopener noreferrer">Show me the steps</a></>,
    },
    old: {
      title: "The API server runs an older version",
      body: <>On Render open <b>dualflow-api</b>, press <b>Manual Deploy</b> and then <b>Deploy latest commit</b>. Or switch to one server mode. <a className="link" href={GUIDE} target="_blank" rel="noopener noreferrer">Show me the steps</a></>,
    },
    server: { title: "The API server had a problem with this page", body: <>Press Try again. If it keeps happening, open Render, then dualflow-web (or dualflow-api), then Logs, and look for red lines.</> },
  };
  const t = text[kind] ?? text.server!;
  const details = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="card border-l-4 border-l-bad p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <IconWarning className="mt-0.5 shrink-0 text-bad" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.title}</p>
          <p className="mt-1 max-w-prose text-fg2">{t.body}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <RetryButton />
          </div>
          <details className="mt-3 text-xs text-fg3">
            <summary className="cursor-pointer select-none">Details for fixing</summary>
            <p className="mt-1 break-all">{details.slice(0, 400)}</p>
          </details>
        </div>
      </div>
    </div>
  );
}
