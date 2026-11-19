-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "research" JSONB;

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "hashtags" TEXT[],
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "thumbnailHeadline" TEXT;
