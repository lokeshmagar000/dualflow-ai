/**
 * /connect/<youtube|meta|tiktok|instagram>/start?lang=ne|en
 * /connect/uploadpost/start?lang=ne|en   Upload-Post's own "connect your accounts" page
 * Pressing a Connect button opens this. We ask the API for the platform's sign-in address
 * (with a signed "state" inside) and send the browser there. middleware.ts checks the login first.
 */
import { api, problemText } from "@/lib/api";
import { callbackUrl, isConnectPlatform, publicOrigin } from "@/lib/connect";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const language = new URL(req.url).searchParams.get("lang") === "ne" ? "ne" : "en";
  const back = new URL("/channels", await publicOrigin());
  if (platform === "uploadpost") {
    // Upload-Post sends you back to the Channels page, which then looks again what is connected.
    const done = new URL("/channels", back);
    done.searchParams.set("uploadpost", "back");
    try {
      const { url } = await api<{ url: string }>("/connect/uploadpost/link", { method: "POST", body: JSON.stringify({ language, redirectUrl: done.toString() }) });
      return Response.redirect(url, 302);
    } catch (e) {
      back.searchParams.set("connect", "error");
      back.searchParams.set("msg", problemText(e).slice(0, 400));
      return Response.redirect(back.toString(), 302);
    }
  }
  if (!isConnectPlatform(platform)) return new Response("Not found", { status: 404 });
  try {
    const { url } = await api<{ url: string }>(`/connect/${platform}/start`, {
      method: "POST",
      body: JSON.stringify({ language, redirectUri: await callbackUrl(platform) }),
    });
    return Response.redirect(url, 302);
  } catch (e) {
    back.searchParams.set("connect", "error");
    back.searchParams.set("msg", problemText(e).slice(0, 300));
    return Response.redirect(back.toString(), 302);
  }
}
