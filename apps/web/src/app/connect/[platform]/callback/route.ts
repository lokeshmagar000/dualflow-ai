/**
 * /connect/<youtube|meta|tiktok>/callback?code=...&state=...
 * Google / Facebook / TikTok send you back here after you press "Allow".
 * We hand the one-time code to the API, which swaps it for a token and saves it (locked).
 * Then we go back to the Channels page with a green or red note.
 */
import { api, problemText } from "@/lib/api";
import { callbackUrl, isConnectPlatform, publicOrigin } from "@/lib/connect";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isConnectPlatform(platform)) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const back = new URL("/channels", await publicOrigin());
  const done = (ok: boolean, msg: string) => {
    back.searchParams.set("connect", ok ? "ok" : "error");
    back.searchParams.set("msg", msg.slice(0, 400));
    return Response.redirect(back.toString(), 302);
  };

  // You pressed "Cancel" (or the platform refused) on the sign-in page.
  const error = q.get("error") || q.get("error_code");
  if (error) {
    const why = q.get("error_description") || q.get("error_reason") || error;
    return done(false, error === "access_denied" ? "You pressed Cancel, so nothing was connected." : `The platform said: ${why}`);
  }
  const code = q.get("code");
  const state = q.get("state");
  if (!code || !state) return done(false, "The sign-in answer had no code. Press Connect again.");

  try {
    const r = await api<{ message: string }>(`/connect/${platform}/finish`, {
      method: "POST",
      body: JSON.stringify({ code, state, redirectUri: await callbackUrl(platform) }),
    });
    return done(true, r.message);
  } catch (e) {
    return done(false, problemText(e));
  }
}
