// Checks that the free plan's keys work. Prints only PASS / FAIL / MISSING,
// never the keys themselves. Run by .github/workflows/check-keys.yml
// (or on your computer: pnpm --filter @dualflow/worker check-keys).
import { PrismaClient } from "@dualflow/db";
import { AwsClient } from "aws4fetch";

const env = process.env;
const results: { service: string; status: string; note: string }[] = [];
const report = (service: string, status: string, note = "") => results.push({ service, status, note });
// Never echo error text that could contain a secret: keep only a short, cleaned reason.
const clean = (s: unknown) => String(s).replace(/(postgres(ql)?:\/\/)[^\s"']+/gi, "$1***").replace(/key=[^&\s]+/gi, "key=***").slice(0, 160);

// 1) Neon database
if (!env.DATABASE_URL) report("Neon database (DATABASE_URL)", "MISSING");
else {
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const rows = await db.$queryRawUnsafe<{ v: string }[]>("select version() as v");
    report("Neon database (DATABASE_URL)", "PASS", String(rows[0]?.v).split(" ").slice(0, 2).join(" "));
  } catch (e) {
    report("Neon database (DATABASE_URL)", "FAIL", clean((e as Error).message.split("\n").filter(Boolean).pop()));
  } finally {
    await db.$disconnect();
  }
}

// 2) Gemini (one tiny request). A "busy" answer (503/429) still means the key was
//    accepted, so we wait and try again, then try the lighter Flash-Lite model.
if (!env.GEMINI_API_KEY) report("Gemini (GEMINI_API_KEY)", "MISSING");
else {
  const models = [env.GEMINI_MODEL || "gemini-flash-latest", "gemini-flash-lite-latest"];
  let done = false;
  let last = "";
  outer: for (const model of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the one Nepali word for hello." }] }] }),
          signal: AbortSignal.timeout(30_000),
        });
        const body = (await res.json().catch(() => ({}))) as any;
        if (res.ok) {
          const text = body.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("").trim();
          report("Gemini (GEMINI_API_KEY)", "PASS", `model ${model} answered: ${clean(text ?? "")}`);
          done = true;
          break outer;
        }
        last = `${model}: HTTP ${res.status}: ${clean(body.error?.message ?? "")}`;
        if (res.status !== 503 && res.status !== 429 && res.status !== 500) break outer; // a real key problem
      } catch (e) {
        last = clean((e as Error).message);
      }
      await new Promise((r) => setTimeout(r, attempt * 5000)); // wait 5 s, 10 s
    }
  }
  if (!done) {
    const busy = /HTTP (503|429|500)/.test(last);
    report("Gemini (GEMINI_API_KEY)", busy ? "BUSY" : "FAIL", busy ? `key accepted, but Google is busy right now (${last})` : last);
  }
}

// 3) Cloudflare R2 (write, read, delete one tiny file)
const r2Names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
const r2Missing = r2Names.filter((n) => !env[n]);
if (r2Missing.length) report("Cloudflare R2", "MISSING", `missing: ${r2Missing.join(", ")}`);
else {
  const bucket = env.R2_BUCKET || "dualflow";
  const url = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/check/key-check.txt`;
  const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, service: "s3", region: "auto" });
  try {
    const put = await r2.fetch(url, { method: "PUT", body: "नमस्ते" });
    if (!put.ok) throw new Error(`upload HTTP ${put.status}`);
    const get = await r2.fetch(url);
    if (!get.ok || (await get.text()) !== "नमस्ते") throw new Error(`download HTTP ${get.status}`);
    await r2.fetch(url, { method: "DELETE" });
    // GitHub hides the bucket name in logs, so say whether it is the default one: when it is not,
    // the dashboard on Render needs R2_BUCKET too (without it, it looks in "dualflow").
    const isDefault = bucket === "dualflow" ? "it is the default name" : 'NOT the default "dualflow": Render needs R2_BUCKET too';
    report("Cloudflare R2", "PASS", `bucket "${bucket}" write/read/delete OK (${isDefault})`);
  } catch (e) {
    report("Cloudflare R2", "FAIL", `${clean((e as Error).message)} (bucket "${bucket}")`);
  }
}

// 3b) Download test: the same short-lived download address the dashboard's Download button
//     makes, for the newest finished video. Shows whether a browser could really get the file.
if (!r2Missing.length && env.DATABASE_URL) {
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const { downloadUrlFor } = await import("@dualflow/storage");
    const newest = await db.variant.findFirst({ where: { outputKey: { not: null } }, orderBy: { updatedAt: "desc" }, select: { outputKey: true } });
    if (!newest?.outputKey) report("Download test", "SKIP", "no finished video in the database");
    else {
      const url = await downloadUrlFor(newest.outputKey, { fileName: "test.mp4" });
      if (!url) report("Download test", "FAIL", "storage is not R2 here");
      else {
        const res = await fetch(url, { headers: { range: "bytes=0-99" } });
        const body = res.ok ? "" : clean((await res.text()).match(/<Code>([^<]+)<\/Code>/)?.[1] ?? "");
        report("Download test", res.ok ? "PASS" : "FAIL", `HTTP ${res.status} ${res.headers.get("content-type") ?? ""} ${body}`.trim());
      }
    }
  } catch (e) {
    report("Download test", "FAIL", clean((e as Error).message));
  } finally {
    await db.$disconnect();
  }
}

// 4) Optional keys (only reported as set / not set)
for (const name of ["AZURE_SPEECH_KEY", "ANTHROPIC_API_KEY"]) report(`${name} (optional)`, env[name] ? "SET" : "not set");

console.log("\n=== KEY CHECK ===");
for (const r of results) console.log(`${r.status.padEnd(8)} ${r.service}${r.note ? `  -- ${r.note}` : ""}`);
console.log("=================\n");
if (results.some((r) => r.status === "FAIL")) process.exitCode = 1;
