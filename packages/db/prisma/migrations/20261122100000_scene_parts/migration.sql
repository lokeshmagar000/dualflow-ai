-- Parts of one spoken line, each with its own picture: [{ "text": "...", "visualQuery": "yak walking snow" }].
-- The picture changes when the voice reaches the next part (e.g. when it says "yak" or "jungle").
ALTER TABLE "Scene" ADD COLUMN "parts" JSONB;
