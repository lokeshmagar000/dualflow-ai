/**
 * "AI for writing" card on the Settings page: Claude or Gemini, and which Claude model.
 *
 *   GET  /ai-settings   the choice + what Claude cost so far (today / this month)
 *   POST /ai-settings   { provider?: "claude" | "gemini", claudeModel?: "claude-haiku-5-5" | "claude-sonnet-5-5" }
 *
 * Saved as AppSetting rows (ai.provider, ai.claudeModel). The video robot on GitHub reads them
 * at the start of every run (apps/worker/src/ai-choice.ts). The dashboard itself never calls Claude,
 * so the Claude key is only needed as a GitHub Secret.
 */
import type { FastifyInstance } from "fastify";
import { prisma } from "@dualflow/db";
import {
  AI_SETTING_KEYS,
  CLAUDE_MODEL_CHOICES,
  DEFAULT_AI_TEXT_PROVIDER,
  DEFAULT_CLAUDE_MODEL,
  isAITextProvider,
  isClaudeModelId,
} from "@dualflow/shared";
import { getDefaultWorkspace } from "../workspace";

async function readSettings(workspaceId: string) {
  const rows = await prisma.appSetting.findMany({ where: { workspaceId, key: { startsWith: "ai." } } });
  const get = (key: string) => rows.find((r) => r.key === key)?.value;
  const provider = get(AI_SETTING_KEYS.provider);
  const model = get(AI_SETTING_KEYS.claudeModel);
  return {
    provider: isAITextProvider(provider) ? provider : DEFAULT_AI_TEXT_PROVIDER,
    claudeModel: isClaudeModelId(model) ? model : DEFAULT_CLAUDE_MODEL,
    saved: isAITextProvider(provider), // false = never saved: the GitHub variable AI_PROVIDER decides (default Claude)
  };
}

async function claudeSpend(workspaceId: string, since: Date) {
  const r = await prisma.costEvent.aggregate({
    _sum: { usd: true },
    _count: true,
    where: { workspaceId, provider: { startsWith: "anthropic:" }, createdAt: { gte: since } },
  });
  return { usd: Math.round((r._sum.usd ?? 0) * 10000) / 10000, calls: r._count };
}

export async function aiSettingsRoutes(app: FastifyInstance) {
  app.get("/ai-settings", async () => {
    const ws = await getDefaultWorkspace();
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [settings, today, month, last] = await Promise.all([
      readSettings(ws.id),
      claudeSpend(ws.id, startOfDay),
      claudeSpend(ws.id, startOfMonth),
      prisma.costEvent.findFirst({ where: { workspaceId: ws.id, provider: { startsWith: "anthropic:" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    return {
      ...settings,
      claudeModels: CLAUDE_MODEL_CHOICES,
      claudeSpend: { today, month, lastUsedAt: last?.createdAt ?? null },
    };
  });

  app.post<{ Body: { provider?: string; claudeModel?: string } }>("/ai-settings", async (req, reply) => {
    const ws = await getDefaultWorkspace();
    const body = req.body ?? {};
    if (body.provider !== undefined && !isAITextProvider(body.provider)) return reply.code(400).send({ message: 'Choose "claude" or "gemini".' });
    if (body.claudeModel !== undefined && !isClaudeModelId(body.claudeModel)) return reply.code(400).send({ message: "Unknown Claude model." });
    const save = (key: string, value: string) =>
      prisma.appSetting.upsert({ where: { workspaceId_key: { workspaceId: ws.id, key } }, update: { value }, create: { workspaceId: ws.id, key, value } });
    if (body.provider) await save(AI_SETTING_KEYS.provider, body.provider);
    if (body.claudeModel) await save(AI_SETTING_KEYS.claudeModel, body.claudeModel);
    await prisma.auditLog.create({ data: { workspaceId: ws.id, actor: "owner", action: "ai.settings", target: JSON.stringify(body).slice(0, 200) } });
    return readSettings(ws.id);
  });
}
