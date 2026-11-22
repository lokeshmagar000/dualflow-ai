/**
 * Cloudflare R2 driver (STORAGE=r2).
 *
 * R2 speaks the same language as Amazon S3. Every request is "signed" with
 * your secret key (the aws4fetch library does this), so only you can read
 * or write your files. Settings (from the R2 page in Cloudflare):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * R2_ENDPOINT is optional (only for tests or another S3-compatible service).
 */
import { AwsClient } from "aws4fetch";
import type { StoredFile } from "./index";

let client: AwsClient | null = null;

/**
 * Cloudflare sometimes answers "500 InternalError, please try again" for a moment.
 * So every request is tried up to 3 times (waiting 1 s, then 3 s) when that happens.
 * All our requests are safe to repeat (reading, listing, uploading the same file again, deleting).
 */
function r2() {
  const aws = rawClient();
  return {
    sign: aws.sign.bind(aws),
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await aws.fetch(url, init);
          if (res.status < 500 || attempt >= 3) return res;
          await res.text().catch(() => "");
        } catch (err) {
          if (attempt >= 3) throw err;
        }
        await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 3000));
      }
    },
  };
}

function rawClient() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || !(process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)) {
    throw new Error("STORAGE=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (R2_BUCKET is optional, default \"dualflow\").");
  }
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return client;
}

/** https://<account>.r2.cloudflarestorage.com/<bucket> */
function bucketUrl(): string {
  const base = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(process.env.R2_BUCKET?.trim() || "dualflow")}`;
}

/** Each part of the key is URL-encoded, the slashes stay. */
function objectUrl(key: string): string {
  return `${bucketUrl()}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function check(res: Response, what: string) {
  if (!res.ok) throw new Error(`R2 ${what} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

export async function r2Put(key: string, data: Buffer | string, contentType: string) {
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  await check(
    await r2().fetch(objectUrl(key), { method: "PUT", body: new Uint8Array(body), headers: { "content-type": contentType } }),
    `upload of ${key}`,
  );
}

export async function r2Get(key: string): Promise<Buffer> {
  const res = await check(await r2().fetch(objectUrl(key)), `download of ${key}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The file as a stream: it flows piece by piece, so a big video never sits whole in memory. */
export async function r2Stream(key: string): Promise<ReadableStream<Uint8Array>> {
  const res = await check(await r2().fetch(objectUrl(key)), `download of ${key}`);
  if (!res.body) throw new Error(`R2 download of ${key} returned no data`);
  return res.body;
}

export async function r2Exists(key: string): Promise<boolean> {
  const res = await r2().fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return false;
  await check(res, `check of ${key}`);
  return true;
}

export async function r2Delete(key: string) {
  const res = await r2().fetch(objectUrl(key), { method: "DELETE" });
  if (res.status !== 404) await check(res, `delete of ${key}`);
}

/** Read one value between <Tag> and </Tag> in R2's XML answer. */
function tagValues(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]!);
}
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export async function r2List(prefix: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  let token: string | undefined;
  do {
    const url = new URL(bucketUrl());
    url.searchParams.set("list-type", "2");
    if (prefix) url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const xml = await (await check(await r2().fetch(url.toString()), "list")).text();
    for (const item of tagValues(xml, "Contents")) {
      files.push({
        key: unescapeXml(tagValues(item, "Key")[0] ?? ""),
        size: Number(tagValues(item, "Size")[0] ?? 0),
        modified: new Date(tagValues(item, "LastModified")[0] ?? 0),
      });
    }
    token = tagValues(xml, "IsTruncated")[0] === "true" ? unescapeXml(tagValues(xml, "NextContinuationToken")[0] ?? "") : undefined;
  } while (token);
  return files;
}

/** The file's size in bytes, or null when it does not exist. */
export async function r2Size(key: string): Promise<number | null> {
  const res = await r2().fetch(objectUrl(key), { method: "HEAD" });
  if (res.status === 404) return null;
  await check(res, `check of ${key}`);
  return Number(res.headers.get("content-length") ?? 0);
}

/**
 * A "presigned" upload address: a normal web address with a signature in it,
 * which lets a browser PUT one file to one key for a short time, WITHOUT knowing our secret key.
 * Used by the bulk upload page, so a big video goes straight to R2 (not through our small free server).
 */
export async function r2PresignPut(key: string, expiresSec = 3600): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresSec));
  const signed = await r2().sign(url.toString(), { method: "PUT", aws: { signQuery: true } });
  return signed.url;
}

/**
 * A presigned DOWNLOAD address: lets the browser GET one file for a short time
 * (default 1 hour), straight from R2. Used by the "Ready to upload" page, so big
 * videos do not have to pass through our small free server.
 * `fileName` is the name the browser saves the file as; `inline` lets the browser
 * play or show the file instead of saving it.
 */
export async function r2PresignGet(key: string, opts: { fileName?: string; inline?: boolean; expiresSec?: number } = {}): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(opts.expiresSec ?? 3600));
  if (opts.fileName) {
    const safe = opts.fileName.replace(/[^\w.\-]+/g, "_");
    url.searchParams.set("response-content-disposition", `${opts.inline ? "inline" : "attachment"}; filename="${safe}"`);
  }
  const signed = await r2().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/** The bucket's name as this server sees it (R2_BUCKET, default "dualflow"). */
export function r2BucketName(): string {
  return process.env.R2_BUCKET?.trim() || "dualflow";
}

/**
 * Asks Cloudflare whether this server can reach the bucket with its keys ("HeadBucket").
 * Returns null when everything is fine, otherwise a plain-words reason and what to fix.
 */
export async function r2Problem(): Promise<string | null> {
  const bucket = r2BucketName();
  let res: Response;
  try {
    res = await r2().fetch(bucketUrl(), { method: "HEAD" });
  } catch (err) {
    const msg = (err as Error).message;
    if (/needs R2_/.test(msg)) return msg;
    return `Could not reach Cloudflare R2 (${msg.slice(0, 120)}). Check that R2_ACCOUNT_ID is right (the same value as in GitHub).`;
  }
  if (res.ok) return null;
  if (res.status === 404) {
    return `Cloudflare R2 says there is no bucket called "${bucket}". Add R2_BUCKET with your real bucket name (the same value as the R2_BUCKET secret in GitHub).`;
  }
  if (res.status === 401 || res.status === 403) {
    return `Cloudflare R2 did not accept the keys (error ${res.status}). Copy R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY again, exactly as in GitHub (no spaces), and check R2_BUCKET is "${bucket}".`;
  }
  return `Cloudflare R2 answered with error ${res.status}. It is often a short hiccup: try again in a minute.`;
}
