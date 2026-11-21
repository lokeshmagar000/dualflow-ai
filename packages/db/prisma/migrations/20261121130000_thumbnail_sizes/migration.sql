-- Extra thumbnail sizes made next to the main thumbnail (e.g. "youtube", "feed", "shorts").
-- Each one is stored as thumbnail-<size>.jpg in the same folder as the main thumbnail.
ALTER TABLE "Thumbnail" ADD COLUMN "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[];
