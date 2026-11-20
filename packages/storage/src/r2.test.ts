/**
 * Test the R2 driver against a tiny fake S3 server on this computer,
 * so the test needs no Cloudflare account and no internet.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { deleteFile, fileExists, fileSize, listFiles, readFile, saveFile, uploadUrlFor } from "./index";

test("R2: upload, check, download, list and delete", async () => {
  const files = new Map<string, Buffer>();
  let signed = true;
  const server = createServer((req, res) => {
    // Every request must be signed with the secret key.
    if (!String(req.headers.authorization ?? "").startsWith("AWS4-HMAC-SHA256")) signed = false;
    const url = new URL(req.url ?? "/", "http://x");
    const key = decodeURIComponent(url.pathname.replace(/^\/my-bucket\/?/, ""));
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "PUT") files.set(key, Buffer.concat(chunks));
      else if (req.method === "DELETE") files.delete(key);
      else if (req.method === "GET" && url.searchParams.get("list-type") === "2") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const items = [...files.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => `<Contents><Key>${k}</Key><Size>${v.length}</Size><LastModified>2026-11-19T00:00:00.000Z</LastModified></Contents>`)
          .join("");
        return res.end(`<ListBucketResult><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`);
      } else if (!files.has(key)) {
        res.statusCode = 404;
        return res.end();
      } else if (req.method === "GET") return res.end(files.get(key));
      else if (req.method === "HEAD") res.setHeader("content-length", files.get(key)!.length);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;

  Object.assign(process.env, {
    STORAGE: "r2",
    R2_ENDPOINT: `http://127.0.0.1:${port}`,
    R2_BUCKET: "my-bucket",
    R2_ACCESS_KEY_ID: "test-id",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  try {
    await saveFile("stories/s1/ne/run-1/subtitles.srt", "नमस्ते");
    assert.equal(await fileExists("stories/s1/ne/run-1/subtitles.srt"), true);
    assert.equal(await fileExists("stories/s1/en/run-1/subtitles.srt"), false);
    assert.equal((await readFile("stories/s1/ne/run-1/subtitles.srt")).toString("utf8"), "नमस्ते");
    assert.equal(await fileSize("stories/s1/ne/run-1/subtitles.srt"), Buffer.byteLength("नमस्ते"));
    assert.equal(await fileSize("stories/s1/en/run-1/subtitles.srt"), null);
    const listed = await listFiles("stories/s1/");
    assert.deepEqual(listed.map((f) => f.key), ["stories/s1/ne/run-1/subtitles.srt"]);
    await deleteFile("stories/s1/ne/run-1/subtitles.srt");
    assert.equal(await fileExists("stories/s1/ne/run-1/subtitles.srt"), false);
    assert.equal(signed, true);
  } finally {
    process.env.STORAGE = "local";
    server.close();
  }
});

test("R2: a presigned upload address is signed and expires", async () => {
  Object.assign(process.env, {
    STORAGE: "r2",
    R2_ENDPOINT: "http://127.0.0.1:9",
    R2_BUCKET: "my-bucket",
    R2_ACCESS_KEY_ID: "test-id",
    R2_SECRET_ACCESS_KEY: "test-secret",
  });
  try {
    const url = new URL((await uploadUrlFor("uploads/abc/video.mp4"))!);
    assert.equal(url.pathname, "/my-bucket/uploads/abc/video.mp4");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.equal(url.toString().includes("test-secret"), false);
  } finally {
    process.env.STORAGE = "local";
  }
  assert.equal(await uploadUrlFor("uploads/abc/video.mp4"), null);
});
