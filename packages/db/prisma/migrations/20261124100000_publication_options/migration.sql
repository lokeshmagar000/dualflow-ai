-- Choices from the dashboard's upload window (for TikTok: who can see it, caption, comments/duet/stitch).
ALTER TABLE "Publication" ADD COLUMN "options" JSONB;
