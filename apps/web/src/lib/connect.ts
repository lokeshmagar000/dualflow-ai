/**
 * Helpers for the one-click "Connect" buttons on the Channels page.
 * The browser never sees tokens or secrets: the dashboard server talks to the API.
 */
import "server-only";
import { headers } from "next/headers";

export type ConnectPlatform = "youtube" | "meta" | "tiktok" | "instagram";
export const CONNECT_PLATFORMS: ConnectPlatform[] = ["youtube", "meta", "tiktok", "instagram"];

export function isConnectPlatform(p: string): p is ConnectPlatform {
  return (CONNECT_PLATFORMS as string[]).includes(p);
}

/**
 * The dashboard's public address, e.g. https://dualflow-web-k3x9.onrender.com.
 * Render tells us with RENDER_EXTERNAL_URL, Vercel with VERCEL_PROJECT_PRODUCTION_URL.
 * PUBLIC_URL can override both (for your own domain).
 * Otherwise we read it from the request (the "host" the browser used).
 */
export async function publicOrigin(): Promise<string> {
  const fixed = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim().replace(/\/+$/, "");
  if (fixed) return /^https?:\/\//.test(fixed) ? fixed : `https://${fixed}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The address the platform sends you back to. You paste it once in Google / Meta / TikTok. */
export async function callbackUrl(platform: ConnectPlatform): Promise<string> {
  return `${await publicOrigin()}/connect/${platform}/callback`;
}
