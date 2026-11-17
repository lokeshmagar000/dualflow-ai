/**
 * Login sessions. After a correct password we give the browser a signed
 * cookie (a JWT). Middleware checks the signature on every page request.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "dualflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as { email: string };
  } catch {
    return null; // expired or tampered
  }
}

export const sessionCookieOptions = {
  httpOnly: true, // JavaScript in the page cannot read it
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
