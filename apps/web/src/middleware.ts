/** Runs before every page: sends visitors without a valid session to /login. */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

// Protect everything except the login page, the public privacy/terms pages, /healthz (the keep-awake check)
// (Google, Meta and TikTok ask for their links) and static files.
export const config = {
  matcher: ["/((?!login|privacy|terms|healthz|_next/static|_next/image|favicon.ico).*)"],
};
