-- "Mark as uploaded" on the Ready to upload page: when you uploaded the video yourself.
ALTER TABLE "Variant" ADD COLUMN "manualUploadedAt" TIMESTAMP(3);
