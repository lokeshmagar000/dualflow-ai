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
function r2() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey || !process.env.R2_BUCKET || !(process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)) {
    throw new Error("STORAGE=r2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
  }
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return client;
}

/** https://<account>.r2.cloudflarestorage.com/<bucket> */
function bucketUrl(): string {
  const base = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return `${base.replace(/\/$/, "")}/${encodeURIComponent(process.env.R2_BUCKET ?? "")}`;
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
