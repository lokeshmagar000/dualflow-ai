-- Nepal Politics series: category, series and real news sources on a topic.
ALTER TABLE "Topic" ADD COLUMN "category" TEXT;
ALTER TABLE "Topic" ADD COLUMN "series" TEXT;
ALTER TABLE "Topic" ADD COLUMN "sources" JSONB;
CREATE INDEX "Topic_workspaceId_category_idx" ON "Topic"("workspaceId", "category");
