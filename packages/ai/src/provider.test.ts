import { test } from "node:test";
import assert from "node:assert/strict";
import { withGeminiBackup } from "./provider";

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const old: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) {
      old[k] = process.env[k];
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    try {
      await fn();
    } finally {
      for (const k of Object.keys(old)) {
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
      }
    }
  };
}

const fail = async (): Promise<string> => {
  throw new Error("credit balance too low");
};

test("Claude chosen: uses Claude when it works", withEnv({ AI_MODE: undefined, AI_PROVIDER: "claude", GEMINI_API_KEY: "g" }, async () => {
  assert.equal(await withGeminiBackup("t", async () => "claude", async () => "gemini"), "claude");
}));

test("Claude chosen: Gemini takes over when Claude fails", withEnv({ AI_MODE: undefined, AI_PROVIDER: "claude", GEMINI_API_KEY: "g", AI_BACKUP: undefined }, async () => {
  assert.equal(await withGeminiBackup("t", fail, async () => "gemini"), "gemini");
}));

test("Claude chosen: no Gemini key = the Claude error is kept", withEnv({ AI_MODE: undefined, AI_PROVIDER: "claude", GEMINI_API_KEY: undefined, GOOGLE_API_KEY: undefined }, async () => {
  await assert.rejects(withGeminiBackup("t", fail, async () => "gemini"), /credit balance/);
}));

test("AI_BACKUP=off turns the backup off", withEnv({ AI_MODE: undefined, AI_PROVIDER: "claude", GEMINI_API_KEY: "g", AI_BACKUP: "off" }, async () => {
  await assert.rejects(withGeminiBackup("t", fail, async () => "gemini"), /credit balance/);
}));

test("Gemini chosen: Claude is never called", withEnv({ AI_MODE: undefined, AI_PROVIDER: "gemini" }, async () => {
  let claudeCalled = false;
  const r = await withGeminiBackup("t", async () => { claudeCalled = true; return "claude"; }, async () => "gemini");
  assert.equal(r, "gemini");
  assert.equal(claudeCalled, false);
}));
