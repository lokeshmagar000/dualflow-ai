/**
 * Publishing tests: modes, the bulk queue, retries and "no delete unless every upload worked".
 * They need a real database, so they run only when DATABASE_URL is set (CI has one).
 * A fake fetch() plays YouTube, so nothing is really uploaded.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@dualflow/db";
import { saveFile } from "@dualflow/storage";
import { assignSlots, planStory, syncChannels, uploadDue } from "./publishing";

const skip = !process.env.DATABASE_URL && "DATABASE_URL not set";
const slug = `publish-test-${Date.now()}`;
let workspaceId = "";
const realFetch = globalThis.fetch;
let failNepali = false;
let uploads = 0;

/** Fake YouTube: gives a token, an upload address, then a video id. */
function fakeYouTube() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers });
    if (url.includes("oauth2")) {
      const params = new URLSearchParams(String(init.body));
      return json({ access_token: `token-for-${params.get("refresh_token")}` });
    }
    if (url.includes("uploadType=resumable")) {
      const auth = String(init.headers.authorization);
      if (failNepali && auth.includes("refresh-ne")) return json({ error: { message: "backend error" } }, 503);
      return json({}, 200, { location: "https://upload.example/u" });
    }
    if (url === "https://upload.example/u") {
      uploads++;
      return json({ id: `vid-${uploads}`, status: { privacyStatus: "private" } });
    }
    return json({}, 404);
  }) as typeof fetch;
}

async function makeStory() {
  const topic = await prisma.topic.create({ data: { workspaceId, title: "Everest" } });
  const story = await prisma.story.create({
    data: {
      workspaceId,
      topicId: topic.id,
      status: "READY",
      variants: { create: ["ne", "en"].map((language) => ({ language: language as "ne" | "en", status: "READY" as const, title: `Everest ${language}`, outputKey: `stories/x/${language}/video.mp4` })) },
    },
  });
  return story.id;
}

before(async () => {
  if (skip) return;
  process.env.STORAGE = "local";
  process.env.STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "dualflow-publish-"));
  await saveFile("stories/x/ne/video.mp4", Buffer.alloc(100, 1));
  await saveFile("stories/x/en/video.mp4", Buffer.alloc(100, 2));
  Object.assign(process.env, {
    PUBLISH_ENABLED: "true",
    PUBLISH_DRY_RUN: "false",
    PUBLISH_PLATFORMS: "youtube",
    YOUTUBE_CLIENT_ID: "id",
    YOUTUBE_CLIENT_SECRET: "secret",
    YOUTUBE_REFRESH_TOKEN_NE: "refresh-ne",
    YOUTUBE_REFRESH_TOKEN_EN: "refresh-en",
  });
  workspaceId = (await prisma.workspace.create({ data: { slug, name: "Publish test" } })).id;
  fakeYouTube();
});

beforeEach(() => {
  failNepali = false;
  process.env.PUBLISH_MODE = "auto";
});

after(async () => {
  globalThis.fetch = realFetch;
  if (!skip) {
    await prisma.story.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { slug } });
  }
  await prisma.$disconnect();
});

test("auto mode: both videos go to their own language channel, then the story is PUBLISHED", { skip }, async () => {
  const channels = await syncChannels(workspaceId);
  assert.deepEqual(channels.map((c) => c.name).sort(), ["YouTube (English)", "YouTube (Nepali)"]);
  const storyId = await makeStory();
  await planStory(storyId);
  await planStory(storyId); // running twice must not add twice
  assert.equal(await prisma.publication.count({ where: { variant: { storyId } } }), 2);
  assert.equal((await prisma.story.findUniqueOrThrow({ where: { id: storyId } })).status, "SCHEDULED");

  const now = new Date("2026-11-19T02:15:00Z"); // 08:00 in Nepal
  await assignSlots(workspaceId, now);
  const pubs = await prisma.publication.findMany({ where: { variant: { storyId } } });
  assert.ok(pubs.every((p) => p.scheduledAt?.toISOString() === "2026-11-19T06:45:00.000Z")); // 12:30 Nepal

  // Before the slot: nothing happens.
  assert.equal((await uploadDue(workspaceId, now)).uploaded, 0);
  // After the slot: both upload.
  const r = await uploadDue(workspaceId, new Date("2026-11-19T07:00:00Z"));
  assert.equal(r.uploaded, 2);
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId }, include: { variants: { include: { publications: true } } } });
  assert.equal(story.status, "PUBLISHED");
  assert.ok(story.variants.every((v) => v.status === "PUBLISHED" && v.publications[0]?.postUrl?.startsWith("https://youtube.com/shorts/")));
});

test("a failed upload is retried later and the story is NOT marked published (files are kept)", { skip }, async () => {
  const storyId = await makeStory();
  await planStory(storyId);
  await prisma.publication.updateMany({ where: { variant: { storyId } }, data: { scheduledAt: new Date(Date.now() - 1000) } });
  failNepali = true;
  const r = await uploadDue(workspaceId, new Date());
  assert.equal(r.uploaded, 1);
  assert.equal(r.waiting, 1);
  const ne = await prisma.publication.findFirstOrThrow({ where: { variant: { storyId, language: "ne" } } });
  assert.equal(ne.status, "SCHEDULED");
  assert.equal(ne.attempts, 1);
  assert.ok(ne.scheduledAt! > new Date(), "the retry is later");
  assert.notEqual((await prisma.story.findUniqueOrThrow({ where: { id: storyId } })).status, "PUBLISHED");

  // The retry works: now the story is published.
  failNepali = false;
  await uploadDue(workspaceId, new Date(Date.now() + 2 * 3600_000));
  assert.equal((await prisma.story.findUniqueOrThrow({ where: { id: storyId } })).status, "PUBLISHED");
});

test("approval mode waits for you; dry run changes nothing", { skip }, async () => {
  process.env.PUBLISH_MODE = "approval";
  await syncChannels(workspaceId);
  const storyId = await makeStory();
  await planStory(storyId);
  const pubs = await prisma.publication.findMany({ where: { variant: { storyId } } });
  assert.deepEqual(pubs.map((p) => p.status), ["READY", "READY"]);
  assert.equal((await prisma.story.findUniqueOrThrow({ where: { id: storyId } })).status, "READY");

  // Approve (what the dashboard button does), then a PRACTICE run.
  await prisma.publication.updateMany({ where: { variant: { storyId } }, data: { status: "SCHEDULED", scheduledAt: new Date(Date.now() - 1000) } });
  process.env.PUBLISH_DRY_RUN = "true";
  const before = uploads;
  const r = await uploadDue(workspaceId, new Date());
  process.env.PUBLISH_DRY_RUN = "false";
  assert.equal(r.practice, 2);
  assert.equal(uploads, before, "nothing was uploaded");
  assert.equal(await prisma.publication.count({ where: { variant: { storyId }, status: "SCHEDULED" } }), 2);
});

test("manual mode adds nothing to the queue", { skip }, async () => {
  process.env.PUBLISH_MODE = "manual";
  await syncChannels(workspaceId);
  const storyId = await makeStory();
  await planStory(storyId);
  assert.equal(await prisma.publication.count({ where: { variant: { storyId } } }), 0);
});
