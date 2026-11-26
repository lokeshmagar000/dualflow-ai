-- true = a person asked for this upload (Upload button, Approve, Retry, bulk upload page).
-- false = queued by the robot; uploaded only while the Auto upload switch is "Fully automatic".
ALTER TABLE "Publication" ADD COLUMN "manual" BOOLEAN NOT NULL DEFAULT false;
