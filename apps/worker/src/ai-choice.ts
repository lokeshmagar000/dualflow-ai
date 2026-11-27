/**
 * The dashboard's "AI for writing" choice (Settings page): Claude or Gemini, and which Claude model.
 *
 * The dashboard saves it in the database (AppSetting rows ai.provider, ai.claudeModel).
 * Here we read it and set AI_PROVIDER / AI_MODEL for this run, so the rest of the code
 * does not need to know where the choice came from. Order of who decides:
 *   1. practice mode (AI_PROVIDER=mock or AI_MODE=mock) always wins,
 *   2. the dashboard choice, once you pressed Save there,
 *   3. otherwise the GitHub variables AI_PROVIDER / AI_MODEL (default: Claude Haiku).
 * Call applyDashboardAiChoice() once, at the start of a run, before any AI work.
 */
import { prisma } from "@dualflow/db";
import { aiProvider, claudeKeySet, geminiBackupOn } from "@dualflow/ai";
import { AI_SETTING_KEYS, isAITextProvider, isClaudeModelId } from "@dualflow/shared";

/** Pure part (tested): which env values the saved settings give. */
export function aiChoiceToEnv(
  settings: { key: string; value: string }[],
  env: Record<string, string | undefined>,
): { AI_PROVIDER?: string; AI_MODEL?: string } {
  if ((env.AI_MODE ?? "").toLowerCase() === "mock" || (env.AI_PROVIDER ?? "").toLowerCase() === "mock") return {};
  const get = (key: string) => settings.find((s) => s.key === key)?.value;
  const out: { AI_PROVIDER?: string; AI_MODEL?: string } = {};
  const provider = get(AI_SETTING_KEYS.provider);
  if (isAITextProvider(provider)) out.AI_PROVIDER = provider;
  const model = get(AI_SETTING_KEYS.claudeModel);
  if (isClaudeModelId(model)) out.AI_MODEL = model;
  return out;
}

export async function applyDashboardAiChoice(): Promise<void> {
  if (process.env.DATABASE_URL) {
    try {
      const ws = await prisma.workspace.findUnique({ where: { slug: "default" } });
      if (ws) {
        const settings = await prisma.appSetting.findMany({ where: { workspaceId: ws.id, key: { startsWith: "ai." } } });
        Object.assign(process.env, aiChoiceToEnv(settings, process.env));
      }
    } catch (err) {
      console.warn(`Could not read the dashboard's AI choice (${(err as Error).message}). Using the GitHub settings.`);
    }
  }

  const provider = aiProvider();
  if (provider === "claude") {
    if (!claudeKeySet()) {
      console.log(`::warning::Claude is chosen but the ANTHROPIC_API_KEY GitHub Secret is missing. ${geminiBackupOn() ? "Gemini will do the writing instead." : "Writing steps will fail."}`);
    }
    console.log(`AI for writing: Claude (${process.env.AI_MODEL || "claude-haiku-5-5"})${geminiBackupOn() ? ", Gemini as the backup" : ""}. Voice: unchanged.`);
  } else {
    console.log(`AI for writing: ${provider === "gemini" ? "Gemini (free)" : "practice data"}. Voice: unchanged.`);
  }
}
