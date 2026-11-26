/**
 * Nepal News & Politics series, for the card on the Ideas page.
 *
 *   GET  /politics               switch, chosen series, videos per day, recent politics videos
 *   POST /politics               { enabled?, series?: string[], perDay?: 0 | 1 | 2 } = save the settings
 *   POST /politics/generate-now  { series: "<id>" | "auto" } = make one politics video now
 *
 * Settings are AppSetting rows (politics.enabled, politics.series, politics.perDay): no new table.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import {
  DEFAULT_POLITICS_SERIES,
  POLITICS_CATEGORY,
  POLITICS_SERIES,
  POLITICS_SERIES_IDS,
  POLITICS_SETTING_KEYS,
  politicsSeries,
} from "@dualflow/shared";
import { githubRunConfigured, triggerPipelineRun } from "../github";
import { getDefaultWorkspace } from "../workspace";

async function readSettings(workspaceId: string) {
  const rows = await prisma.appSetting.findMany({ where: { workspaceId, key: { startsWith: "politics." } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const series = (get(POLITICS_SETTING_KEYS.series)?.split(",") ?? DEFAULT_POLITICS_SERIES).filter((id) => (POLITICS_SERIES_IDS as string[]).includes(id));
  return {
    enabled: get(POLITICS_SETTING_KEYS.enabled) === "true",
    series,
    perDay: Math.max(0, Math.min(2, Number(get(POLITICS_SETTING_KEYS.perDay) ?? 1) || 0)),
  };
}

async function save(workspaceId: string, key: string, value: string) {
  await prisma.appSetting.upsert({ where: { workspaceId_key: { workspaceId, key } }, update: { value }, create: { workspaceId, key, value } });
}

export async function politicsRoutes(app: FastifyInstance) {
  app.get("/politics", async () => {
    const ws = await getDefaultWorkspace();
    const [settings, recent] = await Promise.all([
      readSettings(ws.id),
      prisma.topic.findMany({
        where: { workspaceId: ws.id, category: POLITICS_CATEGORY },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          series: true,
          sources: true,
          createdAt: true,
          stories: { select: { id: true, status: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
      }),
    ]);
    return {
      ...settings,
      allSeries: POLITICS_SERIES.map(({ id, nameEn, nameNe, about, needsNews }) => ({ id, nameEn, nameNe, about, needsNews })),
      generateNowAvailable: githubRunConfigured(),
      recent: recent.map(({ stories, ...t }) => ({ ...t, storyId: stories[0]?.id ?? null, storyStatus: stories[0]?.status ?? null })),
    };
  });

  app.post<{ Body: { enabled?: boolean; series?: string[]; perDay?: number } }>("/politics", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const body = req.body ?? {};
    if (typeof body.enabled === "boolean") await save(ws.id, POLITICS_SETTING_KEYS.enabled, String(body.enabled));
    if (Array.isArray(body.series)) {
      const series = body.series.filter((id) => (POLITICS_SERIES_IDS as string[]).includes(id));
      if (series.length === 0) return reply.code(400).send({ message: "Tick at least one series." });
      await save(ws.id, POLITICS_SETTING_KEYS.series, series.join(","));
    }
    if (body.perDay !== undefined) {
      const n = Number(body.perDay);
      if (![0, 1, 2].includes(n)) return reply.code(400).send({ message: "Videos per day must be 0, 1 or 2." });
      await save(ws.id, POLITICS_SETTING_KEYS.perDay, String(n));
    }
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "politics.settings", target: JSON.stringify(body).slice(0, 200) } });
    return readSettings(ws.id);
  });

  app.post<{ Body: { series?: string } }>("/politics/generate-now", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const wanted = req.body?.series === "auto" || !req.body?.series ? "auto" : req.body.series;
    if (wanted !== "auto" && !politicsSeries(wanted)) return reply.code(400).send({ started: false, message: "Unknown series." });
    if (await prisma.budget.findFirst({ where: { workspaceId: ws.id, paused: true } })) {
      return reply.code(409).send({ started: false, message: "Automation is paused (kill switch on Costs & limits). Turn it back on first." });
    }
    const result = await triggerPipelineRun(undefined, { auto_now: "true", politics_series: wanted });
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "politics.generate_now", target: wanted } });
    if (!result.started) return reply.code(409).send(result);
    const name = wanted === "auto" ? "the next series" : politicsSeries(wanted)!.nameEn;
    return {
      ...result,
      message: `Started ${name}! It reads real sources first, then makes the Nepali + English videos. They appear on Ready to upload in about 15-20 minutes and wait for your approval.`,
    };
  });
}
