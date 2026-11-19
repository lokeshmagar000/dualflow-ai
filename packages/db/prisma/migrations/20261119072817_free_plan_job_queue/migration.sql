-- CreateTable
CREATE TABLE "PipelineJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "variantId" TEXT,
    "run" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineJob_key_key" ON "PipelineJob"("key");

-- CreateIndex
CREATE INDEX "PipelineJob_status_runAfter_idx" ON "PipelineJob"("status", "runAfter");
