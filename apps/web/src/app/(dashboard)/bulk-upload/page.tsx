/**
 * Bulk upload page (/bulk-upload): your own finished video -> YouTube, Facebook,
 * Instagram and TikTok in one click. Protected by the dashboard login (src/middleware.ts).
 */
import Link from "next/link";
import { api, hostName, type BulkSetup, type BulkUploadItem } from "@/lib/api";
import { ApiError, EmptyState, LangBadge, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { UploadStatus, nepalTime } from "@/components/UploadStatus";
import { AutoRefresh } from "@/components/AutoRefresh";
import { retryUpload } from "../content/publish-actions";
import { runUploadNow } from "./actions";
import { BulkUploadForm } from "./BulkUploadForm";

export default async function BulkUploadPage() {
  let setup: BulkSetup;
  let recent: BulkUploadItem[];
  try {
    [setup, recent] = await Promise.all([api<BulkSetup>("/bulk-uploads/setup"), api<BulkUploadItem[]>("/bulk-uploads")]);
    recent = Array.isArray(recent) ? recent : [];
  } catch (e) {
    return (<><PageHeader title="Bulk upload" /><ApiError error={e} /></>);
  }
  const pubs = recent.flatMap((s) => s.variants.flatMap((v) => v.publications));
  // Keep refreshing while anything is waiting or uploading.
  const pending = pubs.some((p) => p.status === "SCHEDULED" || p.status === "GENERATING");

  return (
    <>
      <PageHeader title="Bulk upload" subtitle="Send your own finished video to every channel of its language: one video, one caption, one click." />
      <AutoRefresh active={pending} />
      <BulkUploadForm channels={setup.channels} storage={setup.storage} />

      <section>
        <SectionTitle action={pending ? <ActionButton action={runUploadNow} label="Upload now" pendingLabel="Starting…" className="btn" showOk align="end" /> : undefined}>
          Your bulk uploads
        </SectionTitle>
        {!setup.uploadRunReady && (
          <Notice tone="warn">
            Quick uploads are off (<code>GITHUB_REPO</code> and <code>GITHUB_DISPATCH_TOKEN</code> on {hostName()}), so videos go up with the next Pipeline run (about 1-2 AM Nepal time).
          </Notice>
        )}
        {recent.length === 0 && <EmptyState title="Nothing sent yet">Videos you send with the form above show here, with the result for each platform.</EmptyState>}
        <div className="space-y-4">
          {recent.map((s) =>
            (s.variants ?? []).map((v) => (
              <section key={v.id} className="card p-4 sm:p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link href={`/content/${s.id}`} lang={v.language} className="font-semibold hover:text-brand-fg">{v.title ?? "Untitled"}</Link>
                  <LangBadge lang={v.language} />
                  <span className="text-xs text-fg3">{s.format === "SHORT" ? "Short" : "Long"}, {nepalTime(s.createdAt)}</span>
                </div>
                <ul className="divide-y divide-stroke">
                  {(v.publications ?? []).map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="min-w-40 font-semibold">{p.channel.name}</span>
                      <UploadStatus status={p.status} />
                      {p.postUrl && <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="link">Open post</a>}
                      {p.status === "FAILED" && (
                        <ActionButton action={retryUpload} fields={{ publicationId: p.id }} label="Try again" pendingLabel="Retrying…" className="btn btn-sm btn-danger" />
                      )}
                      {p.error && <p className="w-full break-words text-xs text-fg3">{p.error}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )),
          )}
        </div>
      </section>
    </>
  );
}
