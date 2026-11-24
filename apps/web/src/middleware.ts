/** Runs before every page: sends visitors without a valid session to /login. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Site verification files (TikTok "URL properties", Google, etc.) look like
 * /tiktokAbC123.txt or /google123.html at the site root. They must be public.
 * Two ways to add one:
 *  1. Put the file in apps/web/public/ (it is served as it is), or
 *  2. Set SITE_VERIFICATION_FILE (file name) + SITE_VERIFICATION_TEXT (file text)
 *     on Vercel / Render, then redeploy. No code change needed.
 */
const VERIFY_FILE = /^\/(tiktok[\w-]*\.txt|google[\w-]*\.html)$/i;

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (VERIFY_FILE.test(path)) {
    const name = process.env.SITE_VERIFICATION_FILE?.trim().replace(/^\//, "");
    const text = process.env.SITE_VERIFICATION_TEXT?.trim();
    if (name && text && path.slice(1) === name) {
      return new NextResponse(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return NextResponse.next(); // a file in public/, or a normal 404
  }
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

// Protect everything except the login page, the public privacy/terms pages, /healthz (the keep-awake check)
// (Google, Meta and TikTok ask for their links) and static files.
export const config = {
  matcher: ["/((?!login|privacy|terms|healthz|_next/static|_next/image|favicon.ico|icon.svg|logo-light.svg|logo-dark.svg).*)"],
};
