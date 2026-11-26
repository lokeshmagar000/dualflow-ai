# Night videos: a free alarm clock that always rings

**Problem (2026-11-26):** no night videos were made. Three "alarm clocks" were supposed to start them,
and none of them rang:

| Alarm clock | What happened |
| --- | --- |
| GitHub's own timer (1:05 / 1:35 / 2:05 / 2:35 AM) | GitHub did not start any of them. Free GitHub timers are often hours late or skipped. The only run that night was the 2:15 PM catch-up run, 10 hours late, and that one never adds a new story. |
| Claude scheduled task (1:14 AM) | It failed to start (error on Claude's side). A new copy was made, but it cannot be tested before tonight. |
| Dashboard backup timer | It only works when somebody opens the dashboard at night. Nobody did, and a free Render server sleeps. |

**Fix (10 minutes, free):** let a free website open your dashboard's `/healthz` address at night.
Each visit wakes the dashboard, and the dashboard starts any night video that is still missing
(see `apps/api/src/backup-timer.ts`). It never makes extra videos: it checks the daily limit and
the Auto mode switch first.

## Before you start: check the "Generate now" button

The backup timer uses the same GitHub key as the **Generate now** button (Ideas page).
Press it once. If it says **Started!**, the key (`GITHUB_REPO` + `GITHUB_DISPATCH_TOKEN`) is set and you are ready.
If it says the key is missing, add both values first (see [automatic-videos.md](automatic-videos.md)).

## Steps (cron-job.org)

1. Go to [cron-job.org](https://cron-job.org) and make a free account.
2. Press **Create cronjob**.
3. **Title:** `Night videos`
4. **URL:** your dashboard address + `/healthz`, for example `https://YOUR-DASHBOARD.onrender.com/healthz`
   (or your `vercel.app` address if you moved to Vercel).
5. **Execution schedule:** choose **Custom**, and set:
   - Time zone: **Asia/Kathmandu**
   - Hours: **1, 2**
   - Minutes: **every 5 minutes** (0, 5, 10 ... 55)
   - Every day
   This opens the address every 5 minutes from 1:00 to 2:55 AM, so the server stays awake.
   The first visit wakes the sleeping server (it can take a minute, so cron-job.org may show
   "timeout" once; that is OK). After 1:30 AM a visit starts video 1 if it is missing, and after
   2:00 AM video 2. Both are ready before 3 AM.
6. Press **Create**.
7. Test it: press **Test run** on the job. The answer should look like
   `{"ok":true,"api":true,"nightVideos":"ok","timer":"no video due yet today"}`.
   - `"timer"` tells you in plain words what the backup timer decided. If it says
     `GITHUB_REPO / GITHUB_DISPATCH_TOKEN not set` or `GitHub said 401` / `403`, the dashboard cannot start runs:
     add or renew those two settings (see [automatic-videos.md](automatic-videos.md)).
   - `"api":false` means the dashboard cannot reach its API. See [fix-dashboard-connection.md](fix-dashboard-connection.md).

## How do I know it worked?

In the morning, open GitHub, **Actions** tab, **Pipeline**. You should see runs called
**Night video 1 (backup timer)** and **Night video 2 (backup timer)** started around 1:30-2:00 AM.

## 📚 New words

- **alarm clock / timer**: something that starts a job at a set time.
- **backup**: a second way that works when the first way fails.
- **wake (a server)**: a free server "sleeps" when nobody visits; the first visit makes it start again.
