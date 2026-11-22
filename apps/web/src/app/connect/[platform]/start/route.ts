/**
 * /connect/<youtube|meta|tiktok>/start?lang=ne|en
 * Pressing a Connect button opens this. We ask the API for the platform's sign-in address
 * (with a signed "state" inside) and send the browser there. middleware.ts checks the login first.
 */
import { api, problemText } from "@/lib/api";
import { callbackUrl, isConnectPlatform, publicOrigin } from "@/lib/connect";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) return new Response("Not found", { status: 404 });
  const language = new URL(req.url).searchParams.get("lang") === "ne" ? "ne" : "en";
  const back = new URL("/channels", await publicOrigin());
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
