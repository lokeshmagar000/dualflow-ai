/**
 * /download/all?show=waiting|uploaded|all  = the "Download all" button.
 *
 * The API builds one .zip with every video of that tab and sends it piece by piece;
 * we pass those pieces straight on to the browser (nothing is stored here).
 * middleware.ts checks the login first, so only you can download.
 */
import { apiRaw } from "@/lib/api";

const SHOWS = new Set(["waiting", "uploaded", "all"]);

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("show") ?? "waiting";
  const show = SHOWS.has(raw) ? raw : "waiting";

  const res = await apiRaw(`/ready/zip?show=${show}`);
  if (!res.ok || !res.body) {
    const message = res.status === 404 ? "There are no videos to download on this tab." : "Could not make the zip. Please try again.";
    return new Response(message, { status: res.status === 404 ? 404 : 502 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": res.headers.get("content-disposition") ?? 'attachment; filename="videos.zip"',
      "cache-control": "private, no-store",
    },
  });
}
