import { test } from "node:test";
import assert from "node:assert/strict";
import { aiChoiceToEnv } from "./ai-choice";

test("dashboard choice becomes AI_PROVIDER / AI_MODEL", () => {
  assert.deepEqual(
    aiChoiceToEnv([{ key: "ai.provider", value: "claude" }, { key: "ai.claudeModel", value: "claude-sonnet-5-5" }], { AI_PROVIDER: "gemini" }),
    { AI_PROVIDER: "claude", AI_MODEL: "claude-sonnet-5-5" },
  );
  assert.deepEqual(aiChoiceToEnv([{ key: "ai.provider", value: "gemini" }], {}), { AI_PROVIDER: "gemini" });
});

test("nothing saved or bad values: GitHub settings stay", () => {
  assert.deepEqual(aiChoiceToEnv([], { AI_PROVIDER: "gemini" }), {});
  assert.deepEqual(aiChoiceToEnv([{ key: "ai.provider", value: "openai" }, { key: "ai.claudeModel", value: "x" }], {}), {});
});

test("practice mode always wins", () => {
  assert.deepEqual(aiChoiceToEnv([{ key: "ai.provider", value: "claude" }], { AI_PROVIDER: "mock" }), {});
  assert.deepEqual(aiChoiceToEnv([{ key: "ai.provider", value: "claude" }], { AI_MODE: "mock" }), {});
});
