/**
 * Bulk upload page (/bulk-upload): your own finished video -> YouTube, Facebook,
 * Instagram and TikTok in one click. Protected by the dashboard login (src/middleware.ts).
 */
import Link from "next/link";
import { api, type BulkSetup, type BulkUploadItem } from "@/lib/api";
import { ApiError, Card, PageHeader } from "@/components/ui";
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
  } catch (e) {
    return (<><PageHeader title="Bulk upload" /><ApiError error={e} /></>);
  }
  const pubs = recent.flatMap((s) => s.variants.flatMap((v) => v.publications));
  // Keep refreshing while anything is waiting or uploading.
  const pending = pubs.some((p) => p.status === "SCHEDULED" || p.status === "GENERATING");

  return (
    <>
      <PageHeader title="Bulk upload" subtitle="One video, one caption, one click: it goes to every channel of its language." />
      <AutoRefresh active={pending} />
      <BulkUploadForm channels={setup.channels} storage={setup.storage} />

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Your bulk uploads</h2>
          {pending && (
            <form action={runUploadNow}>
              <button className="rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-zinc-300 hover:bg-zinc-50">Upload now</button>
            </form>
          )}
        </div>
        {!setup.uploadRunReady && (
          <p className="mb-3 text-xs text-amber-700">
            Quick uploads are off (GITHUB_REPO and GITHUB_DISPATCH_TOKEN on Render), so videos go up with the next Pipeline run (2 AM or 4 AM Nepal time).
          </p>
        )}
        {recent.length === 0 && <Card><p className="text-sm text-zinc-500">Nothing sent yet.</p></Card>}
        <div className="space-y-4">
          {recent.map((s) =>
            s.variants.map((v) => (
              <Card key={v.id}>
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <Link href={`/content/${s.id}`} lang={v.language} className="font-medium hover:underline">{v.title}</Link>
                  <span className="text-xs text-zinc-500">
                    {v.language === "ne" ? "Nepali" : "English"} · {s.format === "SHORT" ? "Short" : "Long"} · {nepalTime(s.createdAt)}
                  </span>
                </div>
                <ul className="divide-y divide-zinc-100 text-sm">
                  {v.publications.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="w-44 font-medium">{p.channel.name}</span>
                      <UploadStatus status={p.status} />
                      {p.postUrl && <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">open post</a>}
                      {p.status === "FAILED" && (
                        <form action={retryUpload}>
                          <input type="hidden" name="publicationId" value={p.id} />
                          <button className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-700">Try again</button>
                        </form>
                      )}
                      {p.error && <p className="w-full text-xs text-zinc-500">{p.error}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            )),
          )}
        </div>
      </section>
    </>
  );
}
