# Automatic videos + "Ready to upload" (beginner guide)

The app now makes videos **by itself** and keeps them on your dashboard.
You download them and upload them to YouTube, Facebook, Instagram and TikTok **yourself**.
(Automatic posting comes later. It stays **off**.)

## How it works

1. Every night at about **1:05 AM** and **1:35 AM Nepal time** the **Pipeline** run starts (free),
   so both night videos are **ready by 3 AM**, before you wake up.
   Each run makes **one story = one Nepali video + one English video** (about 15-20 minutes).
2. It picks a topic:
   - first, your own ideas on **Ideas & auto mode** that are not made yet (oldest first),
   - otherwise the **AI Content Director** chooses a new fact topic (it never repeats the last 60).
3. It makes the Nepali + English scripts, voices, Word Pop subtitles, thumbnails and the two `.mp4` videos.
4. The videos are saved in Cloudflare R2 and appear on **Ready to upload**.

By default it makes **2 stories a day** (= 4 videos: 2 Nepali + 2 English), ready when you wake up.

**Who starts the night runs (so a night is never empty):** GitHub's own timer is often hours late
(on 25 Nov it started the night runs 7 hours late, at 9:18 AM). So three starters work together:
1. **A Claude scheduled task** starts "Night video 1" and "Night video 2" at about **1:15 AM** every night.
2. **GitHub's timer** at 1:05 and 1:35 AM, with backups at **2:05 AM** and **2:35 AM**.
3. **The dashboard's backup timer** (below) after 1:30 and 2:00 AM.
Every run first checks how many night videos already exist, so you never get extra videos.
A **catch-up run at 2:15 PM** finishes videos that had to wait for the free Gemini limit
(it resets at 1:45 PM Nepal time). It never starts a new topic.

**Free Gemini limit:** Gemini's free plan allows about **20 requests a day**, which is enough for about
**2 stories**. The day resets at **1:45 PM Nepal time**. So if you press **Generate now** in the afternoon or
evening, that uses the requests the night videos need, and the night videos wait for the next reset.

**Change the times:** open `.github/workflows/pipeline.yml` and edit the `cron:` lines
(and `SCHEDULE_UTC` in `apps/api/src/routes/auto.ts`, so the dashboard shows the right times).
GitHub's clock is UTC, which is 5 hours 45 minutes *behind* Nepal:

| Nepal time | cron line (UTC) |
| --- | --- |
| 1:05 AM | `"20 19 * * *"` (7:20 PM UTC the evening before) |
| 1:35 AM | `"50 19 * * *"` (7:50 PM UTC the evening before) |
| 6:00 AM | `"15 0 * * *"` |

If you add a third time, also set `AUTO_STORIES_PER_DAY` to `3` (below).

## Auto mode switch and "Generate now" (Ideas & auto mode page)

At the top of **Ideas & auto mode** is the **🤖 Automatic videos** card:
- **Auto mode ON/OFF**: ON = the AI makes videos by itself every night (ready by 3 AM).
  This switch is **only about making videos**. It is different from **Auto upload** on the Channels page:
  you can keep Auto upload **OFF** (you post by hand) and the videos are still made. OFF = the night runs make nothing.
- **⚡ Generate now**: the AI picks a topic and makes one Nepali + English video right away (about 15-20 minutes),
  even when Auto mode is off. It needs `GITHUB_REPO` + `GITHUB_DISPATCH_TOKEN` on Render. Without them, use
  GitHub → **Actions** → **Pipeline** → **Run workflow** → tick **Make one automatic video now**.
- It also shows the next run times and the topics the AI picked.
Your own ideas (added below the card) are always made first.

## Backup timer (when GitHub's night timer is late or skips)

GitHub's free timer is not reliable. On 23 Nov the 2 AM run started 4½ hours late, and on
24 Nov the night runs did not start at all, so no videos were made. On 25 Nov they started 7 hours late.

So the dashboard now checks too. After **1:30 AM** Nepal it makes sure video 1 exists, and after
**2:00 AM** video 2. If one is missing and no run is busy, it starts the run itself. On the
Actions page that run is called **Night video 1 (backup timer)** or **Night video 2 (backup timer)**.
It never makes extra videos: it still follows the daily limit and the Auto mode switch.

The check happens when:
- **Vercel** opens `/healthz` by itself once between 1:45-2:45 AM and once between 2:25-3:25 AM
  (set in `apps/web/vercel.json`, nothing to do), or
- your **UptimeRobot** keep-awake checker opens `/healthz` (every few minutes), or
- you open **any page** of the dashboard.

It needs the same two settings as the Generate now button: `GITHUB_REPO` and
`GITHUB_DISPATCH_TOKEN` (a token with **Actions: Read and write**) on your dashboard (Vercel or Render).
If Generate now works, the backup timer works too.

## Delete a video

**Ready to upload** (or a story's page under **Content**) → **🗑 Delete** → **OK**.
It removes the story for good: both the Nepali and the English video, their files in R2 and their text.
The topic stays marked "used", so the AI does not make the same topic again.

## Download everything at once

**Ready to upload** → **⬇ Download all … as .zip**. You get one zip of every video on the tab you are on
(up to 40, newest first). Inside are two folders, `Nepali` and `English`; each video comes with its
thumbnail and a `-text.txt` file holding the title, description and hashtags to paste.

## Turn it on (one time, about 2 minutes)

Nothing new is needed on Render or in GitHub Secrets. Your existing secrets
(`DATABASE_URL`, `GEMINI_API_KEY`, `R2_*`) are enough.

1. Merge the pull request on GitHub (green **Merge pull request** button).
2. Wait about 5 minutes. Render rebuilds the dashboard and API by itself.
3. Open your dashboard. In the left menu you see **Ready to upload**.
4. Want a video now instead of waiting? GitHub → **Actions** → **Pipeline** → **Run workflow** → **Run workflow**.
   After about 20 minutes the two videos appear on **Ready to upload**.

## Every day: upload by hand

On **Ready to upload**:

1. **⬇ Download Nepali video** → upload it to your **Nepali** channels.
2. Press **Copy** next to the title and next to the description + hashtags, and paste them into YouTube / Facebook / Instagram / TikTok.
3. **Thumbnail** downloads the cover picture (for YouTube's custom thumbnail).
4. Press **Mark as uploaded**. The card turns green and moves to the **Uploaded** tab.
5. Do the same for the **English** video on your **English** channels.

## Change the settings (optional)

GitHub → your repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** tab → **New repository variable**:

| Name | What it does | Default |
| --- | --- | --- |
| `AUTO_STORIES_PER_DAY` | Stories a day (each = 1 Nepali + 1 English video). `0` turns automatic videos off. | `2` |
| `AUTO_TOPIC_NICHE` | What the AI picks topics about, in plain English | science, space, nature, animals, history, the body, technology and Nepal |
| `KEEP_DAYS_AFTER_UPLOAD` | Days a video stays after you marked both languages uploaded | `7` |
| `READY_KEEP_DAYS` | Days a video stays if you never mark it | `30` |

Free limits to keep in mind:
- **Gemini free tier**: about 3 stories a day at most. The run waits for tomorrow when the free requests are used up.
- **GitHub Actions** (private repo): 2,000 free minutes a month. One story takes about 15 minutes, so
  2 a day uses about 1,000 minutes. Do not go above 3 a day. (Only 2 runs a day now, instead of 8,
  also saves the minutes the empty runs used to take.)
- **Cloudflare R2**: 10 GB free. Old videos are deleted by the rules above.

To stop everything at once: **Costs & limits** → kill switch (pause).
