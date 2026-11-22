-- Settings saved from the dashboard's Channels page (one-click "Connect" buttons and the
-- "Auto upload" switch). App keys are stored encrypted, never in plain text.
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppSetting_workspaceId_key_key" ON "AppSetting"("workspaceId", "key");

ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
