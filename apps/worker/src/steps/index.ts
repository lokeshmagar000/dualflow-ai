/**
 * The pipeline steps.
 *
 * Order:  research (once per story)
 *      -> script, voice, thumbnail, render (once per language, in parallel)
 *
 * Phase 1A: research and script are real (Gemini free, Claude, or practice data: AI_PROVIDER).
 * Phase 1B: voice is real (Gemini, Azure, Edge or the practice voice: VOICE_PROVIDER)
 *           and makes the subtitles too.
 * Phase 1C: render makes the real .mp4 and thumbnail (Remotion + free Pexels clips).
 */
import { prisma, type Prisma } from "@dualflow/db";
import { findHashtags, researchTopic, writeScript, type Research } from "@dualflow/ai";
import { BRAND_COLORS, brandFor, JOB_NAMES, THUMBNAIL_SIZE_NAMES, thumbnailKeyFor, type JobName, type Language, type PipelineJobData } from "@dualflow/shared";
import { AIQuotaError, nextQuotaReset } from "@dualflow/ai";
import {
  buildCues,
  getVoiceProvider,
  makeVoiceover,
  VoiceQuotaError,
  type Voiceover,
  type WordTiming,
} from "@dualflow/voice";
import { readFile, saveFile } from "@dualflow/storage";
import {
  findMedia,
  findPhoto,
  mainThumbnailSize,
  makeJobFolder,
  prepareIntro,
  renderThumbnail,
  renderVideo,
  type FoundMedia,
  type Media,
} from "@dualflow/video";
import { copyFile, mkdir, readFile as readLocal, writeFile } from "node:fs/promises";
import path from "node:path";
import { enqueue } from "@dualflow/queue";
import {
  assertAzureFreeQuota,
  assertBudget,
  assertGeminiQuota,
  assertGeminiVoiceQuota,
  recordCosts,
  voiceFallback,
} from "../budget";
import { planStory } from "../publishing";
import { planShots } from "./shots";

type Step = (data: PipelineJobData) => Promise<void>;

/** Queue a step for every variant (Nepali and English) at the same time. */
async function fanOut(storyId: string, run: number, next: JobName) {
  const variants = await prisma.variant.findMany({ where: { storyId } });
  await Promise.all(variants.map((v) => enqueue(next, { storyId, variantId: v.id, run })));
}

/**
 * Queue the next step for one variant.
 * The job key includes the run number: adding the same key twice does nothing,
 * which stops duplicate work if a step is retried.
 */
async function then(data: PipelineJobData, next: JobName) {
  await enqueue(next, data);
}

const research: Step = async ({ storyId, run = 1 }) => {
  const story = await prisma.story.findUniqueOrThrow({ where: { id: storyId }, include: { topic: true } });
  await assertBudget(story.workspaceId);
  await assertGeminiQuota(story.workspaceId, 2); // research = 2 requests

  const { research, costs } = await researchTopic({
    title: story.topic.title,
    notes: story.topic.notes,
    format: story.format,
  });
  await recordCosts(story.workspaceId, story.id, costs);

  // Save the facts on the topic. Replacing old ones first makes a retry safe.
  await prisma.$transaction([
    prisma.researchNote.deleteMany({ where: { topicId: story.topicId } }),
    prisma.researchNote.createMany({
      data: research.facts.map((f) => ({
        topicId: story.topicId,
        claim: f.claim,
        sourceUrl: f.sourceUrl || null,
        verified: Boolean(f.sourceUrl),
      })),
    }),
    prisma.story.update({
      where: { id: story.id },
      data: {
        visualPlan: research.visualPlan as unknown as Prisma.InputJsonValue,
        research: {
          summary: research.summary,
          facts: research.facts,
          thumbnailQuery: research.thumbnailQuery,
        } as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  await fanOut(storyId, run, JOB_NAMES.script);
};

const script: Step = async (data) => {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { id: data.variantId },
    include: { story: { include: { topic: true } } },
  });
  const { story } = variant;
  await assertBudget(story.workspaceId);
  await assertGeminiQuota(story.workspaceId, 1); // one script = 1 request
  await prisma.variant.update({ where: { id: variant.id }, data: { status: "GENERATING", lastError: null } });

  // Rebuild the Research object saved by the research step.
  const saved = story.research as unknown as Pick<Research, "summary" | "facts" | "thumbnailQuery"> | null;
  const visualPlan = story.visualPlan as unknown as Research["visualPlan"] | null;
  if (!saved || !visualPlan) throw new Error("Research is missing for this story.");

  const { script, costs } = await writeScript({
    language: variant.language as Language,
    title: story.topic.title,
    format: story.format,
    research: { ...saved, thumbnailQuery: saved.thumbnailQuery ?? "", visualPlan },
  });
  await recordCosts(story.workspaceId, story.id, costs);

  // Trending hashtags for this language (Google search through Gemini, 1 more free request).
  // If today's free limit is nearly used up, skip the search: the script's own hashtags are used.
  const searchAllowed = await assertGeminiQuota(story.workspaceId, 1).then(() => true, () => false);
  const tags = await findHashtags({
    language: variant.language as Language,
    format: story.format,
    title: script.title || story.topic.title,
    summary: saved.summary,
    scriptHashtags: script.hashtags,
    allowSearch: searchAllowed,
  });
  await recordCosts(story.workspaceId, story.id, tags.costs);

  // Replace the scenes (safe to run twice) and save title, description, hashtags.
  await prisma.$transaction([
    prisma.scene.deleteMany({ where: { variantId: variant.id } }),
    prisma.scene.createMany({
      // `order` is the visual plan's scene number (writeScript matched each line to its
      // picture), so the render step shows the right picture for every line.
      data: script.scenes.map((s) => ({
        variantId: variant.id,
        order: s.order,
        purpose: visualPlan[s.order - 1]?.purpose ?? null,
        text: s.text,
      })),
    }),
    prisma.variant.update({
      where: { id: variant.id },
      data: {
        title: script.title,
        description: script.description,
        hashtags: tags.hashtags,
        thumbnailHeadline: script.thumbnailHeadline,
      },
    }),
  ]);

  await then(data, JOB_NAMES.voice);
};

/**
 * Voice: read every scene aloud, glue the audio together, and make subtitles
 * from the exact time of every word.
 * Saves: voice.wav, subtitles.srt, subtitles.vtt (in storage),
 *        a Voiceover row (with word times), a Subtitle row,
 *        and the start/end time of every scene.
 */
const voice: Step = async (data) => {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { id: data.variantId },
    include: { story: true, scenes: { orderBy: { order: "asc" } } },
  });
  const { story } = variant;
  if (variant.scenes.length === 0) throw new Error("The script has no scenes to read.");

  const language = variant.language as Language;
  const characters = variant.scenes.reduce((n, s) => n + s.text.length, 0);
  let provider = getVoiceProvider(story.id); // story id: Gemini picks a voice per story
  if (provider.name !== "mock") await assertBudget(story.workspaceId); // kill switch + budget
  if (provider.name === "azure") await assertAzureFreeQuota(story.workspaceId, characters);

  let vo: Voiceover;
  try {
    // Gemini: check the free daily voice limit first (it is small, about 15 a day).
    if (provider.name === "gemini") await assertGeminiVoiceQuota(story.workspaceId, variant.scenes);
    vo = await makeVoiceover(provider, language, variant.scenes);
  } catch (err) {
    // Gemini's free voices are used up for today: use the backup voice so the video is not late.
    const fallback = voiceFallback();
    if (!(err instanceof VoiceQuotaError || err instanceof AIQuotaError) || provider.name !== "gemini") throw err;
    if (!fallback) throw err instanceof AIQuotaError ? err : new AIQuotaError(err.message, nextQuotaReset());
    console.log(`Gemini voice limit reached, using the backup voice (${fallback.name}) for this video.`);
    provider = fallback;
    vo = await makeVoiceover(provider, language, variant.scenes);
  }

  // File names include the run number, so a retry never overwrites files
  // that an older run (or the dashboard) is still using.
  const folder = `stories/${story.id}/${language}/run-${data.run ?? 1}`;
  const audioKey = `${folder}/voice.wav`;
  const srtKey = `${folder}/subtitles.srt`;
  await Promise.all([
    saveFile(audioKey, vo.wav),
    saveFile(srtKey, vo.srt),
    saveFile(`${folder}/subtitles.vtt`, vo.vtt),
  ]);

  // Record real voices (Edge is free, but we still count its characters).
  // Gemini counts requests, because its free limit is "requests per day".
  if (provider.name !== "mock") {
    await recordCosts(story.workspaceId, story.id, [
      provider.name === "gemini"
        ? { provider: "gemini-tts", units: vo.requests, unitType: "requests", usd: 0 }
        : {
            provider: `${provider.name}-tts`,
            units: vo.characters,
            unitType: "characters",
            usd: provider.costUsd(vo.characters),
          },
    ]);
  }

  // Replace old rows (safe to run twice), then save the new ones together.
  await prisma.$transaction([
    prisma.voiceover.deleteMany({ where: { variantId: variant.id } }),
    prisma.subtitle.deleteMany({ where: { variantId: variant.id } }),
    prisma.voiceover.create({
      data: {
        variantId: variant.id,
        provider: provider.name,
        voice: provider.voiceFor(language),
        storageKey: audioKey,
        wordTimings: vo.words as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.subtitle.create({ data: { variantId: variant.id, storageKey: srtKey } }),
    ...vo.scenes.map((t) =>
      prisma.scene.update({
        where: { variantId_order: { variantId: variant.id, order: t.order } },
        data: { startMs: t.startMs, endMs: t.endMs },
      }),
    ),
    prisma.variant.update({ where: { id: variant.id }, data: { durationSec: vo.durationMs / 1000 } }),
  ]);

  await then(data, JOB_NAMES.thumbnail);
};

const thumbnail: Step = async (data) => {
  // The thumbnail is made together with the video in the render step
  // (it uses the same pictures), so this step only passes the job on.
  await then(data, JOB_NAMES.render);
};

/**
 * Render: make the real .mp4 and the thumbnail.
 *  1. Download the voice from storage into a job folder.
 *  2. Find a free stock clip for every scene (Pixabay or Pexels, if a key is set).
 *  3. Remotion draws the video: pictures + voice + title + subtitles.
 *  4. Upload video.mp4 and thumbnail.jpg to storage; save the rows.
 */
const render: Step = async (data) => {
  const variant = await prisma.variant.findUniqueOrThrow({
    where: { id: data.variantId },
    include: {
      story: { include: { topic: true } },
      scenes: { orderBy: { order: "asc" } },
      voiceovers: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const { story } = variant;
  const voiceover = variant.voiceovers[0];
  if (!voiceover) throw new Error("There is no voiceover to put in the video.");
  if (!variant.durationSec) throw new Error("The voiceover length is unknown.");
  const language = variant.language as Language;
  const format = story.format;
  const renderJob = await prisma.renderJob.create({
    data: { variantId: variant.id, status: "RUNNING", attempts: 1 },
  });

  const job = await makeJobFolder();
  try {
    await writeFile(path.join(job.dir, "voice.wav"), await readFile(voiceover.storageKey));

    const words = (voiceover.wordTimings as unknown as WordTiming[] | null) ?? [];
    const durationMs = Math.round(variant.durationSec * 1000);

    // Pictures that follow the voice: every scene gets the picture planned for ITS line
    // (scene.order = number in the visual plan), shown exactly while that line is spoken.
    // A long line is split at a sentence end into two shots with two different clips,
    // so one picture never has to stay on screen for too long.
    const plan = (story.visualPlan as unknown as Research["visualPlan"] | null) ?? [];
    const shots = planShots(
      variant.scenes.map((s) => ({ order: s.order, text: s.text, startMs: s.startMs ?? 0, endMs: s.endMs ?? durationMs })),
      words,
    );
    const used = new Set<number>();
    const media: (FoundMedia | null)[] = [];
    for (const [i, shot] of shots.entries()) {
      const p = plan[shot.order - 1];
      // The second shot of a long line uses the simpler backup words first, for variety.
      const queries = shot.part === 0 ? [p?.visualQuery, p?.backupQuery] : [p?.backupQuery, p?.visualQuery];
      queries.push(story.topic.title);
      const seconds = (shot.endMs - shot.startMs) / 1000;
      media.push(await findMedia(queries, format, job.dir, `shot-${i + 1}`, used, seconds));
    }

    // "Namaste Facts" in English videos, "नमस्ते फ्याक्ट्स" in Nepali videos (BRAND_NAME_* settings).
    const brandInfo = brandFor(language);
    const brand = brandInfo.name;
    const accent = process.env.VIDEO_ACCENT || BRAND_COLORS.marigold;
    const toMedia = (m: FoundMedia | null | undefined) => (m ? { src: job.url(m.file), kind: m.kind } : null);

    const videoFile = path.join(job.dir, "video.mp4");
    const started = Date.now();
    await renderVideo(
      {
        format,
        language,
        title: variant.thumbnailHeadline || variant.title || story.topic.title,
        audioFile: job.url("voice.wav"),
        durationMs,
        brand,
        brandTag: brandInfo.tag, // always a string: "" = no label (see Root.tsx)
        accent,
        scenes: shots.map((s, i) => ({ startMs: s.startMs, endMs: s.endMs, text: s.text, media: toMedia(media[i]) })),
        cues: buildCues(words),
        // Word Pop subtitles need the time of every word.
        words,
        subtitleStyle: process.env.SUBTITLE_STYLE === "classic" ? "classic" : "word-pop",
        // Short animated intro with the channel name and a sound (INTRO_* settings).
        intro: await prepareIntro(language, job),
      },
      videoFile,
      (p) => console.log(`[render] ${language} ${Math.round(p * 100)}%`),
    );
    console.log(`[render] ${language} video made in ${Math.round((Date.now() - started) / 1000)} s`);

    // Thumbnails: one per platform size, with a photo of the video's main subject
    // (the research step picks the search words). No photo found: a frame from the first clip.
    const research = story.research as { thumbnailQuery?: string } | null;
    const thumbQuery = research?.thumbnailQuery || plan[0]?.visualQuery || story.topic.title;
    const photoIds = new Set<number>();
    const tallPhoto = await findPhoto(thumbQuery, true, job.dir, "thumb-photo-tall", photoIds);
    const widePhoto = await findPhoto(thumbQuery, false, job.dir, "thumb-photo-wide", photoIds);
    const firstClip = media.find((m) => m) ?? null;
    const clipFrame: Media | null = firstClip ? { ...toMedia(firstClip)!, atSec: 1.5 } : null;
    const mainSize = mainThumbnailSize(format);
    const thumbFiles: Record<string, string> = {};
    for (const size of THUMBNAIL_SIZE_NAMES) {
      const photo = size === "youtube" ? (widePhoto ?? tallPhoto) : (tallPhoto ?? widePhoto);
      const file = path.join(job.dir, size === mainSize ? "thumbnail.jpg" : `thumbnail-${size}.jpg`);
      await renderThumbnail(
        {
          format,
          size,
          language,
          headline: variant.thumbnailHeadline || variant.title || story.topic.title,
          media: photo ? toMedia(photo) : clipFrame,
          brand,
          brandTag: brandInfo.tag, // always a string: "" = no label (see Root.tsx)
          accent,
        },
        file,
      );
      thumbFiles[size] = file;
    }
    const thumbFile = thumbFiles[mainSize]!;
    const extraSizes = THUMBNAIL_SIZE_NAMES.filter((size) => size !== mainSize);

    // Upload. The run number in the folder keeps a retry from overwriting older files.
    const folder = `stories/${story.id}/${language}/run-${data.run ?? 1}`;
    const videoKey = `${folder}/video.mp4`;
    const thumbKey = `${folder}/thumbnail.jpg`;
    await saveFile(videoKey, await readLocal(videoFile));
    await saveFile(thumbKey, await readLocal(thumbFile));
    for (const size of extraSizes) await saveFile(thumbnailKeyFor(thumbKey, size), await readLocal(thumbFiles[size]!));
    // Optional: also keep a copy here (GitHub shows them as a download, so you can watch them).
    if (process.env.VIDEO_COPY_DIR) {
      await mkdir(process.env.VIDEO_COPY_DIR, { recursive: true });
      const name = `${story.topic.title}-${language}`.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 80);
      await copyFile(videoFile, path.join(process.env.VIDEO_COPY_DIR, `${name}.mp4`));
      await copyFile(thumbFile, path.join(process.env.VIDEO_COPY_DIR, `${name}.jpg`));
      for (const size of extraSizes) await copyFile(thumbFiles[size]!, path.join(process.env.VIDEO_COPY_DIR, `${name}-${size}.jpg`));
    }

    // Remember where each clip came from (credits).
    const assets = await Promise.all(
      media.map((m) =>
        m
          ? prisma.asset.create({
              data: {
                workspaceId: story.workspaceId,
                type: m.kind === "video" ? "VIDEO" : "IMAGE",
                storageKey: `${m.provider}:${m.id}`,
                license: m.provider === "pixabay" ? "Pixabay Content License" : "Pexels license",
                sourceUrl: m.sourceUrl,
              },
            })
          : null,
      ),
    );

    await prisma.$transaction([
      ...variant.scenes.map((s) => {
        const first = shots.findIndex((shot) => shot.order === s.order);
        return prisma.scene.update({ where: { id: s.id }, data: { assetId: (first >= 0 ? assets[first]?.id : null) ?? null } });
      }),
      prisma.thumbnail.deleteMany({ where: { variantId: variant.id } }),
      prisma.thumbnail.create({
        data: { variantId: variant.id, storageKey: thumbKey, headline: variant.thumbnailHeadline, sizes: [...extraSizes] },
      }),
      prisma.renderJob.update({ where: { id: renderJob.id }, data: { status: "DONE", outputKey: videoKey } }),
      prisma.variant.update({ where: { id: variant.id }, data: { status: "READY", outputKey: videoKey, lastError: null } }),
    ]);
  } catch (err) {
    await prisma.renderJob.update({
      where: { id: renderJob.id },
      data: { status: "FAILED", error: String((err as Error).message).slice(0, 500) },
    });
    throw err;
  } finally {
    await job.remove();
  }
  await markStoryReadyIfDone(data.storyId);
};

/**
 * Publish: both videos are ready, so put them in the upload queue
 * (auto mode) or the approval list (approval mode). Manual mode does nothing here.
 * The actual uploads happen in the upload run after the videos are made
 * (`pnpm --filter @dualflow/worker upload`), at each channel's next free time slot.
 */
const publish: Step = async ({ storyId }) => {
  await planStory(storyId);
};

/** When BOTH languages are ready, the story is ready. */
async function markStoryReadyIfDone(storyId: string) {
  const notReady = await prisma.variant.count({ where: { storyId, status: { not: "READY" } } });
  if (notReady > 0) return;
  const story = await prisma.story.update({ where: { id: storyId }, data: { status: "READY" } });
  await enqueue(JOB_NAMES.publish, { storyId, run: story.run });
}

export const steps: Record<JobName, Step> = { research, script, voice, thumbnail, render, publish };
