/**
 * PICTURE CHECK with Claude (used by the video maker when Claude is the chosen AI).
 * Claude looks at up to 8 small stock pictures at once and says which ones really
 * show what the narrator is talking about. Same job as the Gemini picture check.
 * Cost: about 8 small pictures = a few thousand tokens = well under $0.001 on Haiku.
 */
import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, currentModel, fallbackOptions } from "./client";
import { claudeCost, type CostLine } from "./cost";

const PassSchema = z.object({
  pass: z.array(z.number().int()).describe("Numbers of the pictures that pass, best first. Empty if none pass."),
  note: z.string().describe("One short sentence about why."),
});

/** Claude accepts these picture types. */
const CLAUDE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

export interface PictureForCheck {
  mimeType: string;
  base64: string;
}

/**
 * Ask Claude which pictures pass. `instructions` = the same strict rules the Gemini check uses.
 * Returns 1-based picture numbers, best first.
 */
export async function claudeCheckPictures(pictures: PictureForCheck[], instructions: string): Promise<{ pass: number[]; cost: CostLine }> {
  const content: ({ type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: ClaudeImageType; data: string } })[] = [];
  pictures.forEach((p, i) => {
    const mediaType = (CLAUDE_IMAGE_TYPES as readonly string[]).includes(p.mimeType) ? (p.mimeType as ClaudeImageType) : "image/jpeg";
    content.push({ type: "text", text: `Picture ${i + 1}:` }, { type: "image", source: { type: "base64", media_type: mediaType, data: p.base64 } });
  });
  content.push({ type: "text", text: instructions });

  const model = currentModel();
  const res = await claude().beta.messages.parse({
    model,
    max_tokens: 2000,
    ...fallbackOptions(),
    output_config: { effort: "low", format: betaZodOutputFormat(PassSchema) },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Picture check was declined by the model.");
  if (!res.parsed_output) throw new Error("Could not read the picture check answer.");
  return { pass: res.parsed_output.pass, cost: claudeCost(model, res.usage) };
}
