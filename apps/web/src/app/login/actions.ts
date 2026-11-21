"use server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** Compare two strings safely (no timing leaks). */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// "email" comes back so the box keeps what you typed after a wrong password
// (React empties a form after it is sent).
export type LoginState = { error?: string; email?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const okEmail = safeEqual(email, (process.env.ADMIN_EMAIL ?? "").toLowerCase());
  const okPassword = safeEqual(password, process.env.ADMIN_PASSWORD ?? "");
  if (!okEmail || !okPassword || !process.env.ADMIN_PASSWORD) {
    return { error: "Wrong email or password", email };
  }

  const token = await createSessionToken(email);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
