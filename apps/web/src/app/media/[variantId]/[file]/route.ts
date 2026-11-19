/**
 * /media/<variantId>/<audio|srt|vtt>
 *
 * The browser asks the dashboard for a file; the dashboard asks the API
 * (with the secret key) and passes the file back. This way the secret key
 * never reaches the browser. The login check in middleware.ts also runs
 * here, so only a signed-in user can download files.
 *
 * Our files are small (a few MB), so we load the whole file and then send
 * the part the browser asked for.
 */
import { apiRaw } from "@/lib/api";

const ALLOWED = new Set(["audio", "srt", "vtt"]);

export async function GET(req: Request, { params }: { params: Promise<{ variantId: string; file: string }> }) {
  const { variantId, file } = await params;
  if (!ALLOWED.has(file) || !/^[a-z0-9]+$/i.test(variantId)) {
    return new Response("Not found", { status: 404 });
  }
  const res = await apiRaw(`/variants/${variantId}/files/${file}`);
  if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });

  const body = Buffer.from(await res.arrayBuffer());
  const headers = new Headers({
    "content-type": res.headers.get("content-type") ?? "application/octet-stream",
    "content-disposition": res.headers.get("content-disposition") ?? "inline",
    "cache-control": "private, no-store",
    // "accept-ranges" tells the browser it may ask for just a part of the file.
    // Audio players need this to jump forward and back (seek).
    "accept-ranges": "bytes",
  });

  // A "Range" request asks for some bytes only, e.g. "bytes=1000-" (from byte 1000 to the end).
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = body.length;
    // "bytes=-500" means "the last 500 bytes".
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(body.subarray(start, end + 1), { status: 206, headers });
  }

  headers.set("content-length", String(body.length));
  return new Response(body, { status: 200, headers });
}
