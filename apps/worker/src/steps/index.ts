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
import { prisma, Prisma } from "@dualflow/db";
import { findHashtags, researchTopic, writeScript, type Research, type TopicSource } from "@dualflow/ai";
import { BRAND_COLORS, brandFor, politicsSeries, POLITICS_CATEGORY, sourceLine, JOB_NAMES, THUMBNAIL_SIZE_NAMES, thumbnailKeyFor, videoStyle, type JobName, type Language, type PipelineJobData } from "@dualflow/shared";
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
  findCheckedMedia,
  findPhoto,
  mainThumbnailSize,
  makeJobFolder,
  normaliseLoudness,
  prepareIntro,
  prepareV2,
  splitLongShots,
  renderThumbnail,
  renderVideo,
  renderVideoV2,
  visionRequests,
  visionCosts,
  type FoundMedia,
  type Media,
  type V2Text,
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
import { planShots, type ScenePart } from "./shots";
import { fetchFlag, findCommonsPhoto, type CommonsPhoto, type NewsCardInput, type V2NewsCard, type V2Props } from "@dualflow/video";
import { fullVideoExtras, makeShorts, sharedPictures, type SavedClip } from "./full";
import { findNewsPhoto, newsPhotoCheck } from "@dualflow/video";
import { pictureSpots, type MyPicture } from "./mypictures";

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

  const series = story.topic.category === POLITICS_CATEGORY ? politicsSeries(story.topic.series) : undefined;
  const { research, costs, sources } = await researchTopic({
    title: story.topic.title,
    notes: story.topic.notes,
    format: story.format,
    // Nepal Politics: neutral rules, the real news it came from, and at least 3 sources.
    politics: story.topic.category === POLITICS_CATEGORY
      ? { seriesName: series?.nameEn ?? "Nepal Politics", sources: (story.topic.sources as TopicSource[] | null) ?? [] }
      : null,
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
          focus: research.focus,
          broll: research.broll,
          // Full video: its parts (each one can also become a short).
          chapters: research.chapters ?? [],
          // The web pages the research used (shown as "Source:" in politics videos).
          sources: sources.slice(0, 12),
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
  const saved = story.research as unknown as (Pick<Research, "summary" | "facts" | "thumbnailQuery"> & { focus?: string; broll?: Research["broll"]; chapters?: Research["chapters"] }) | null;
  const visualPlan = story.visualPlan as unknown as Research["visualPlan"] | null;
  if (!saved || !visualPlan) throw new Error("Research is missing for this story.");

  const { script, costs } = await writeScript({
    language: variant.language as Language,
    title: story.topic.title,
    format: story.format,
    research: { ...saved, thumbnailQuery: saved.thumbnailQuery ?? "", focus: saved.focus ?? "", broll: saved.broll ?? [], chapters: saved.chapters ?? [], visualPlan },
    politics: story.topic.category === POLITICS_CATEGORY,
    headlines: ((story.topic.sources as TopicSource[] | null) ?? []).map((h) => ({ title: h.title, publisher: h.publisher })),
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
        // Pieces of the line with their own pictures (the picture changes on these words).
        parts: s.parts.length ? (s.parts as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      })),
    }),
    prisma.variant.update({
      where: { id: variant.id },
      data: {
        title: script.title,
        description: script.description,
        hashtags: tags.hashtags,
        thumbnailHeadline: script.thumbnailHeadline,
        // Style V2 on-screen text (hook, topic chip, key words, number card, follow text).
        style: {
          hookLines: script.hookLines,
          hookHighlight: script.hookHighlight,
          topicChip: script.topicChip,
          emphasis: script.emphasis,
          cards: script.cards,
          followText: script.followText,
          newsCards: script.newsCards,
          people: script.people,
          chapterTitles: script.chapterTitles,
        } satisfies V2Text as unknown as Prisma.InputJsonValue,
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
    include: { story: { include: { topic: true } }, scenes: { orderBy: { order: "asc" } } },
  });
  const { story } = variant;
  if (variant.scenes.length === 0) throw new Error("The script has no scenes to read.");

  const language = variant.language as Language;
  const characters = variant.scenes.reduce((n, s) => n + s.text.length, 0);
  // A different voice on every video: count the stories made before this one, and give
  // the English video the other voice. Story 1: Nepali Aoede, English Charon; story 2: the opposite...
  const storiesBefore = await prisma.story.count({ where: { createdAt: { lt: story.createdAt } } });
  // Nepal News & Politics: a calm news-reader voice instead of the lively storyteller.
  const mood = story.topic.category === POLITICS_CATEGORY ? "news" : "default";
  let provider = getVoiceProvider(`#${storiesBefore + (language === "en" ? 1 : 0)}`, mood);
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
    // FULL VIDEO: the pictures come from the shared plan only (not each language's own "parts"),
    // so the Nepali and the English video can share the same checked pictures (half the searches
    // and picture checks).
    const long = format === "LONG";
    const lineShots = planShots(
      variant.scenes.map((s) => ({
        order: s.order,
        text: s.text,
        startMs: s.startMs ?? 0,
        endMs: s.endMs ?? durationMs,
        parts: long ? null : ((s.parts as unknown as ScenePart[] | null) ?? null),
      })),
      words,
    );
    // STYLE V2: a shot longer than ~3 s is cut into ~2 s pieces; the extra pieces show
    // other on-topic pictures (people, places, maps... from the research "broll" list),
    // so the video keeps flowing instead of staying on one picture.
    // A FULL VIDEO always uses the new look (in wide 16:9). Its pictures change about every
    // 3-4 seconds (a short: every ~2 seconds), so a 5-minute video needs fewer searches.
    const v2 = long || (videoStyle() === "v2" && format === "SHORT");
    const shots = long ? splitLongShots(lineShots, 6500, 3500) : v2 ? splitLongShots(lineShots) : lineShots.map((s) => ({ ...s, extra: false }));
    const broll = ((story.research as { broll?: { query: string; mustShow?: string }[] } | null)?.broll ?? []).filter((b) => b?.query);
    let nextBroll = 0;
    const used = new Set<number>();
    const media: (FoundMedia | null)[] = [];
    // What the whole video is about: the picture check uses it to be strict
    // (a story about Nepal's flag never shows another country's flag).
    const focus = (story.research as { focus?: string } | null)?.focus || story.topic.title;
    const visionBefore = visionRequests;
    const visionCostsBefore = visionCosts.length;
    // Full video: one picture search per plan scene / b-roll idea, shared by both languages.
    const shared = long ? sharedPictures(story.id) : null;
    const find = (key: string, queries: string[], mustShow: string, name: string, seconds: number) =>
      shared
        ? shared.find(key, (dir, used2) => findCheckedMedia(queries, mustShow, focus, format, dir, `m-${key}`, used2, Math.max(seconds, 4)), job.dir, name)
        : findCheckedMedia(queries, mustShow, focus, format, job.dir, name, used, seconds);
    // EVERY picture shows what ITS line talks about (owner's rule: hydropower line -> hydropower,
    // heritage line -> heritage, mountains -> mountains). A line split into pieces shows other views
    // of the SAME subject (altQuery / backupQuery), not a random b-roll idea of the whole topic.
    // Shorts may still use a b-roll idea as the very last choice; a full video repeats the line's
    // own picture instead (a right picture twice beats a wrong one).
    const extraCount = new Map<number, number>();
    // 1st choice: YOUR pictures ("My pictures" on the Ready page). They take the news-photo lines
    // first, then lines spread over the video. 2nd: a REAL news photo (Wikimedia Commons, with
    // PIB / PM India photos) for lines about the event itself. 3rd: stock video of the line's subject.
    // Pictures added on the Ideas page (before the story existed) are copied to the story once,
    // so they also show (and can be changed) on the Ready page.
    if (!story.myPictures && story.topic.myPictures) {
      story.myPictures = story.topic.myPictures;
      await prisma.story.update({ where: { id: story.id }, data: { myPictures: story.topic.myPictures as Prisma.InputJsonValue } });
    }
    const mine = ((story.myPictures as unknown as MyPicture[] | null) ?? []).filter((m) => m?.key);
    const mySpots = pictureSpots(plan.map((q) => Boolean(q?.newsPhoto?.trim())), mine.length);
    const myMedia = async (k: number, name: string): Promise<FoundMedia | null> => {
      const m = mine[k]!;
      try {
        const file = `${name}-mine${path.extname(m.key) || (m.kind === "video" ? ".mp4" : ".jpg")}`;
        await writeFile(path.join(job.dir, file), await readFile(m.key));
        return { file, kind: m.kind, sourceUrl: "", provider: "mine", id: 0, credit: m.credit || undefined, fit: m.kind === "image" ? "contain" : undefined };
      } catch (err) {
        console.warn(`My pictures: could not read ${m.key} (${(err as Error).message}).`);
        return null;
      }
    };
    const newsUsed = new Set<string>();
    const news = (key: string, query: string, mustShow: string, name: string) => {
      const search = (dir: string, file: string) =>
        findNewsPhoto(query, dir, file, newsPhotoCheck(mustShow, focus), newsUsed).then((r) =>
          r ? { file: r.file, kind: "image" as const, sourceUrl: r.pageUrl, provider: "commons", id: 0, credit: r.credit, fit: "contain" as const } : null,
        );
      return shared ? shared.find(key, (dir) => search(dir, `m-${key}`), job.dir, name) : search(job.dir, name);
    };
    for (const [i, shot] of shots.entries()) {
      const p = plan[shot.order - 1];
      const seconds = (shot.endMs - shot.startMs) / 1000;
      if (!shot.extra && shot.part === 0) {
        const k = mySpots.get(shot.order);
        const own = k === undefined ? null : await myMedia(k, `shot-${i + 1}`);
        if (own) {
          media.push(own);
          continue;
        }
        if (p?.newsPhoto?.trim()) {
          const real = await news(`n${shot.order}`, p.newsPhoto, p.mustShow || p.newsPhoto, `shot-${i + 1}`);
          if (real) {
            media.push(real);
            continue;
          }
        }
      }
      const clean = (list: (string | undefined)[]) => [...new Set(list.map((q) => q?.trim() ?? "").filter(Boolean))];
      // Extra pieces show the whole line's subject; a line part shows what that part names.
      const lineMustShow = shot.extra
        ? p?.mustShow || p?.visualQuery || shot.mustShow || shot.visualQuery || story.topic.title
        : shot.mustShow || (shot.part === 0 ? p?.mustShow : "") || shot.visualQuery || p?.visualQuery || story.topic.title;
      if (shot.extra) {
        const k = (extraCount.get(shot.order) ?? 0) + 1;
        extraCount.set(shot.order, k);
        // Take turns between the line's other views, so two pieces of one line differ.
        const views = clean([p?.altQuery, p?.backupQuery, p?.visualQuery]);
        const queries = views.length ? [...views.slice((k - 1) % views.length), ...views.slice(0, (k - 1) % views.length)] : [];
        let found = queries.length ? await find(`p${shot.order}-x${k}`, queries, lineMustShow, `shot-${i + 1}`, seconds) : null;
        if (!found && !long && broll.length) {
          const bi = nextBroll++ % broll.length;
          const b = broll[bi]!;
          found = await find(`b${bi}`, clean([b.query]), b.mustShow || b.query, `shot-${i + 1}`, seconds);
        }
        media.push(found);
        continue;
      }
      // A part of a line shows the thing that part names ("yak", "jungle") first.
      // The second shot of a long line uses the simpler backup words first, for variety.
      const planned = shot.part === 0 ? [p?.visualQuery, p?.altQuery, p?.backupQuery] : [p?.backupQuery, p?.altQuery, p?.visualQuery];
      // The video's title is a poor stock search; a full video never uses it.
      const queries = clean([shot.visualQuery, ...planned, long ? undefined : story.topic.title]);
      let found = await find(`p${shot.order}-${shot.part}`, queries, lineMustShow, `shot-${i + 1}`, seconds);
      if (!found && !long && v2 && broll.length) {
        // Short: nothing passed for this line, so show a variety picture of the same topic.
        const bi = nextBroll++ % broll.length;
        const b = broll[bi]!;
        found = await find(`b${bi}`, [b.query], b.mustShow || b.query, `shot-${i + 1}`, seconds);
      }
      media.push(found);
    }
    // Still nothing? Keep the picture before (or after) on screen: a plain colour looks cheap.
    if (v2) {
      for (let i = 0; i < media.length; i++) media[i] ??= media.slice(0, i).reverse().find(Boolean) ?? media.slice(i + 1).find(Boolean) ?? null;
    }

    // "Namaste Facts" in English videos, "नमस्ते फ्याक्ट्स" in Nepali videos (BRAND_NAME_* settings).
    const brandInfo = brandFor(language);
    const brand = brandInfo.name;
    const accent = process.env.VIDEO_ACCENT || BRAND_COLORS.marigold;
    // durationSec lets the video loop a short clip smoothly instead of freezing on its last frame.
    const toMedia = (m: FoundMedia | null | undefined) =>
      m ? { src: job.url(m.file), kind: m.kind, durationSec: m.durationSec, ...(m.credit ? { credit: m.credit } : {}), ...(m.fit ? { fit: m.fit } : {}) } : null;

    const videoFile = path.join(job.dir, "video.mp4");
    const started = Date.now();
    let fullProps: V2Props | null = null;
    if (v2) {
      // STYLE V2: hook on frame 1 (no logo intro), music + sound effects, key-word stickers,
      // number card, follow pill in the middle and a loop ending (no like & follow card).
      const props = await prepareV2({
        job,
        language,
        audioFile: job.url("voice.wav"),
        durationMs,
        words,
        lines: variant.scenes.map((s) => ({ order: s.order, purpose: s.purpose, startMs: s.startMs ?? 0, endMs: s.endMs ?? durationMs })),
        shots: shots.map((s, i) => ({ startMs: s.startMs, endMs: s.endMs, media: toMedia(media[i]) })),
        text: variant.style as Partial<V2Text> | null,
        fallbackHook: variant.thumbnailHeadline || variant.title || story.topic.title,
        brand,
        brandTag: brandInfo.tag,
        ...politicsOnScreen(story, language),
        news: await prepareNews(story, language, variant.style as Partial<V2Text> | null, job.dir, job.url),
        ...(long ? fullVideoExtras(story.research, variant.style as Partial<V2Text> | null, variant.scenes, language, durationMs) : {}),
      });
      fullProps = props;
      const raw = path.join(job.dir, "video-raw.mp4");
      await renderVideoV2(props, raw);
      if (!(await normaliseLoudness(raw, videoFile))) await copyFile(raw, videoFile);
    } else {
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
          // The "like and follow" card with the platform logos appears when the narrator
          // starts asking for it (the call-to-action line), or for the last 3.5 seconds.
          ctaStartMs:
            [...variant.scenes].reverse().find((s) => s.purpose === "call_to_action")?.startMs ?? Math.max(0, durationMs - 3500),
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
    }
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

    // FULL VIDEO: cut 2-3 shorts out of it (same voice, pictures and cards; no AI cost).
    let clips: SavedClip[] | null = null;
    if (long && fullProps) {
      try {
        clips = await makeShorts({ props: fullProps, job, folder, language, research: story.research, text: variant.style as Partial<V2Text> | null, scenes: variant.scenes });
      } catch (err) {
        // The full video is fine: never lose it because a short failed.
        console.warn(`[shorts] ${language}: could not make the shorts (${(err as Error).message}).`);
      }
    }

    // The picture check uses free Gemini requests: show them on the costs page.
    const visionUsed = visionRequests - visionBefore;
    if (visionUsed > 0) await recordCosts(story.workspaceId, story.id, [{ provider: "gemini-vision", units: visionUsed, unitType: "requests", usd: 0 }]);
    // Picture checks done by Claude cost a little money: record them too.
    const claudeVision = visionCosts.slice(visionCostsBefore);
    if (claudeVision.length > 0) {
      const usd = claudeVision.reduce((sum, c) => sum + c.usd, 0);
      const units = claudeVision.reduce((sum, c) => sum + c.units, 0);
      await recordCosts(story.workspaceId, story.id, [{ provider: `${claudeVision[0]!.provider}:vision`, units, unitType: "tokens", usd }]);
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
      prisma.variant.update({
        where: { id: variant.id },
        data: { status: "READY", outputKey: videoKey, lastError: null, ...(clips ? { clips: clips as unknown as Prisma.InputJsonValue } : {}) },
      }),
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

/**
 * Nepal Politics videos: the series name as the topic chip ("PM Files") and a small
 * "Source: ..." line, from the news the topic came from and the research's sources.
 */
function politicsOnScreen(
  story: { research: Prisma.JsonValue; topic: { category: string | null; series: string | null; sources: Prisma.JsonValue } },
  language: Language,
): { source?: string; seriesChip?: string } {
  if (story.topic.category !== POLITICS_CATEGORY) return {};
  const saved = (story.research ?? {}) as { facts?: { sourceUrl?: string }[]; sources?: { url: string; title: string }[] };
  const news = (story.topic.sources as TopicSource[] | null) ?? [];
  const line = sourceLine(language, [
    ...news.map((n) => ({ publisher: n.publisher, url: n.url })),
    ...(saved.sources ?? []).map((s) => ({ url: s.url, title: s.title })),
    ...(saved.facts ?? []).map((f) => ({ url: f.sourceUrl })),
  ], 2); // 2 names fit on one line; the Ready page lists all of them
  const series = politicsSeries(story.topic.series);
  return { source: line, seriesChip: series ? (language === "ne" ? series.nameNe : series.nameEn) : undefined };
}

/** "23 Nov 2026" / "२३ नोभेम्बर २०२६" (Nepal time). */
export function newsDate(date: Date, language: Language): string {
  const parts = new Intl.DateTimeFormat(language === "ne" ? "ne-NP" : "en-GB", {
    timeZone: "Asia/Kathmandu",
    day: "numeric",
    month: language === "ne" ? "long" : "short",
    year: "numeric",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")}`; // day month year in both languages
}

/**
 * News / politics videos: the news bar (series name + date of the news) and the news graphics,
 * with their flags (flagcdn.com) and Wikimedia Commons photos downloaded into the job folder.
 * A card whose picture cannot be found is left out. Normal videos: null.
 */
async function prepareNews(
  story: { createdAt: Date; topic: { category: string | null; series: string | null; sources: Prisma.JsonValue } },
  language: Language,
  text: Partial<V2Text> | null,
  dir: string,
  url: (name: string) => string,
) {
  if (story.topic.category !== POLITICS_CATEGORY) return null;
  const series = politicsSeries(story.topic.series);
  const news = (story.topic.sources as TopicSource[] | null) ?? [];
  const when = news[0]?.publishedAt ? new Date(news[0].publishedAt) : story.createdAt;
  const flagCache = new Map<string, string | null>();
  const flag = async (code: string) => {
    if (!flagCache.has(code)) flagCache.set(code, await fetchFlag(code, dir));
    return flagCache.get(code) ? url(flagCache.get(code)!) : null;
  };
  // One photo per person (the same file is used each time they are named).
  const photoCache = new Map<string, Promise<CommonsPhoto | null>>();
  const photoOf = (person: string) => {
    const key = person.toLowerCase();
    if (!photoCache.has(key)) photoCache.set(key, findCommonsPhoto(person, dir, photoCache.size));
    return photoCache.get(key)!;
  };
  const cards: NewsCardInput[] = [];
  // People: their real photo shows at the moment the narration says their name.
  for (const p of text?.people ?? []) {
    const found = await photoOf(p.person);
    if (!found) continue;
    cards.push({ order: p.order, kind: "photo", title: p.role, by: p.name, date: "", from: "", to: "", flags: [], points: [], say: p.name, photo: { src: url(found.file), credit: found.credit } });
  }
  for (const c of text?.newsCards ?? []) {
    const flags = (await Promise.all(c.countries.map(flag))).filter((f): f is string => Boolean(f));
    let photo: V2NewsCard["photo"] = null;
    if (c.kind === "photo") {
      const found = await photoOf(c.person);
      if (!found) continue;
      photo = { src: url(found.file), credit: found.credit };
    }
    if (c.kind === "flags" && flags.length === 0) continue;
    cards.push({ order: c.order, kind: c.kind, title: c.title, by: c.by, date: c.date, from: c.from, to: c.to, flags, points: c.points, photo });
  }
  return {
    label: series ? (language === "ne" ? series.nameNe : series.nameEn).toUpperCase() : language === "ne" ? "समाचार" : "NEWS",
    date: newsDate(when, language),
    cards,
  };
}
