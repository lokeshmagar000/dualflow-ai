-- Uploads to social channels: remember the post link and count retries.
ALTER TABLE "Publication" ADD COLUMN "postUrl" TEXT;
ALTER TABLE "Publication" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
