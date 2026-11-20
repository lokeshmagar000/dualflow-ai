# Automatic videos + "Ready to upload" (beginner guide)

The app now makes videos **by itself** and keeps them on your dashboard.
You download them and upload them to YouTube, Facebook, Instagram and TikTok **yourself**.
(Automatic posting comes later. It stays **off**.)

## How it works

1. Every 3 hours GitHub starts the **Pipeline** run (free).
2. It picks a topic:
   - first, your own ideas on **Ideas & Chat** that are not made yet (oldest first),
   - otherwise the **AI Content Director** chooses a new fact topic (it never repeats the last 60).
3. It makes the Nepali + English scripts, voices, Word Pop subtitles, thumbnails and the two `.mp4` videos.
4. The videos are saved in Cloudflare R2 and appear on **Ready to upload**.

By default it makes **2 stories a day** (= 4 videos: 2 Nepali + 2 English).

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
  2 a day uses about 1,000 minutes. Do not go above 3 a day.
- **Cloudflare R2**: 10 GB free. Old videos are deleted by the rules above.

To stop everything at once: **Costs & Automation** → kill switch (pause).
