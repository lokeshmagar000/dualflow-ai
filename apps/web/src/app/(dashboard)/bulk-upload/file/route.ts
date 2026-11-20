/**
 * Only used with LOCAL storage (on your own computer): the browser sends the video here,
 * and we pass it on to the API, which saves it. With R2 (the free cloud plan) the browser
 * sends the video straight to R2 instead, and this route is not used.
 *
 * It is protected by the login like every dashboard page (see src/middleware.ts).
 */
import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function PUT(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const res = await fetch(`${API_URL}/bulk-uploads/file?key=${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      "content-type": req.headers.get("content-type") ?? "video/mp4",
      "x-internal-key": process.env.INTERNAL_API_KEY ?? "",
    },
    body: await req.arrayBuffer(),
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
