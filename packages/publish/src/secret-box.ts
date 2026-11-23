/**
 * Locks and unlocks secrets (channel tokens, app keys) before they go into the database.
 *
 * How it works: AES-256-GCM, a standard, strong lock. The key is made from
 *   TOKEN_KEY             if you set it (same value on Render AND in GitHub Secrets), else
 *   R2_SECRET_ACCESS_KEY  which the dashboard (Render) and the worker (GitHub) already both have.
 * So a copy of the database alone is not enough to read your tokens.
 *
 * Each locked value starts with a short "key id", so if the dashboard and GitHub have
 * DIFFERENT keys we can say so in plain words instead of failing with a strange error.
 *
 * Format: "v1.<keyId>.<iv>.<tag>.<data>" (each part is base64url).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type Env = Record<string, string | undefined>;

export class SecretKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretKeyError";
  }
}

function keyMaterial(env: Env): { source: string; value: string } | null {
  const own = env.TOKEN_KEY?.trim();
  if (own) return { source: "TOKEN_KEY", value: own };
  const r2 = env.R2_SECRET_ACCESS_KEY?.trim();
  if (r2) return { source: "R2_SECRET_ACCESS_KEY", value: r2 };
  return null;
}

/** True when this server can lock and unlock secrets. */
export function secretBoxReady(env: Env = process.env): boolean {
  return keyMaterial(env) !== null;
}

/** Which setting the key comes from ("TOKEN_KEY" or "R2_SECRET_ACCESS_KEY"), for help texts. */
export function secretKeySource(env: Env = process.env): string | null {
  return keyMaterial(env)?.source ?? null;
}

function keyFor(env: Env) {
  const m = keyMaterial(env);
  if (!m) {
    throw new SecretKeyError("No key to lock tokens with: add R2_SECRET_ACCESS_KEY (or TOKEN_KEY) on your dashboard host (Render or Vercel) and in GitHub Secrets.");
  }
  const key = createHash("sha256").update(`dualflow-token-box:${m.value}`).digest();
  // The id is a different hash, so it tells nothing about the key itself.
  const id = createHash("sha256").update(`dualflow-token-box-id:${m.value}`).digest("base64url").slice(0, 8);
  return { key, id, source: m.source };
}

/** The short id of this server's key (to compare the dashboard's with GitHub's). */
export function secretKeyId(env: Env = process.env): string | null {
  return keyMaterial(env) ? keyFor(env).id : null;
}

export function lockSecret(plain: string, env: Env = process.env): string {
  const { key, id } = keyFor(env);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", id, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unlockSecret(locked: string, env: Env = process.env): string {
  const [v, id, iv, tag, data] = locked.split(".");
  if (v !== "v1" || !id || !iv || !tag || data === undefined) throw new SecretKeyError("A saved token is damaged. Connect that channel again.");
  const k = keyFor(env);
  if (id !== k.id) {
    throw new SecretKeyError(
      `The saved tokens were locked with a different key. Make ${k.source} the same on Render (dualflow-web) and in GitHub Secrets, ` +
        "or press Connect again on the Channels page.",
    );
  }
  const decipher = createDecipheriv("aes-256-gcm", k.key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
