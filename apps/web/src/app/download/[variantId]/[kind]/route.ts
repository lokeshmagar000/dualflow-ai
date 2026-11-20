/**
 * /download/<variantId>/<video|thumbnail|srt>   (add ?inline=1 to play or show it in the page)
 *
 * The browser asks the dashboard; the dashboard asks the API with the secret key.
 *  - Files in Cloudflare R2: the API gives a short-lived download address and we
 *    send the browser there (a "redirect"). The big video comes straight from R2,
 *    not through our small free server.
 *  - Files on this computer: we pass the file through.
 * middleware.ts checks the login first, so only you can download.
 */
import { apiRaw } from "@/lib/api";

const KINDS = new Set(["video", "thumbnail", "srt"]);

export async function GET(req: Request, { params }: { params: Promise<{ variantId: string; kind: string }> }) {
  const { variantId, kind } = await params;
  if (!KINDS.has(kind) || !/^[a-z0-9]+$/i.test(variantId)) return new Response("Not found", { status: 404 });
  const inline = new URL(req.url).searchParams.get("inline") === "1";

  const res = await apiRaw(`/variants/${variantId}/download/${kind}${inline ? "?inline=1" : ""}`);
  if (!res.ok) {
    const message = res.status === 404 ? "This file is not there any more (it may have been deleted after upload)." : "Could not get the file.";
    return new Response(message, { status: res.status === 404 ? 404 : 502 });
  }

  if ((res.headers.get("content-type") ?? "").includes("application/json")) {
    const { url } = (await res.json()) as { url?: string };
    if (!url) return new Response("Could not get the file.", { status: 502 });
    return Response.redirect(url, 302);
  }

  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "content-disposition": res.headers.get("content-disposition") ?? "attachment",
      "cache-control": "private, no-store",
    },
  });
}
