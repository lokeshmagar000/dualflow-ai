# Bulk upload: one video to every channel in one click

Open your dashboard and click **Bulk upload** (the link is `https://<your-dashboard>/bulk-upload`).
It is behind the same login as the rest of the dashboard, so nobody else can use it.

1. Drop your finished video (.mp4 or .mov, up to 1 GB).
2. Pick the language. **Nepali videos go only to your Nepali channels, English videos only to your English channels.**
   (Typing Nepali letters in the title picks Nepali for you.)
3. Write a title, one caption and (optional) hashtags.
4. Each platform's rules are checked right away. A platform that would refuse the video
   (too long, too short, too big) is shown in red with the reason and is not ticked.
5. Press **Send everywhere**. The video goes straight from your browser to R2, then the small
   **Upload now** GitHub run starts and uploads it (about 2-5 minutes).
6. The list under the form shows every platform's result: *in the queue*, *uploading*, *uploaded*
   (with a link to the post) or *failed* (with the reason and a **Try again** button).
   The page refreshes by itself while something is still uploading.

## Rules we check (packages/publish/src/limits.ts)

| Platform | Length | File size | Notes |
| --- | --- | --- | --- |
| YouTube | up to 12 h (over 15 min needs a phone-verified channel) | 256 GB | vertical and up to 3 min = Short |
| Facebook | at least 3 s | 1 GB (normal video) | Reel if vertical and up to 90 s, otherwise a normal Page video (up to 20 min) |
| Instagram | 3 s to 15 min | 300 MB | always a Reel |
| TikTok | 3 s to 10 min (TikTok tells us your exact limit) | 4 GB | |

## One-time setup (free)

The bulk page uses what you already set up in [social-setup.md](social-setup.md) (channel tokens,
`PUBLISH_ENABLED=true`, `PUBLISH_DRY_RUN=false`; beginner version: [channel-and-token-guide.md](channel-and-token-guide.md)). Two more things:

### 1. Let your browser send videos to R2 (CORS)

Cloudflare → **R2** → your bucket (`dualflow`) → **Settings** → **CORS Policy** → **Add CORS policy**, paste this
and put your dashboard address in place of the example:

```json
[
  {
    "AllowedOrigins": ["https://dualflow-web.onrender.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Without it, sending stops with "The video could not be sent".

### 2. Quick uploads (optional, recommended)

If `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` are set on Render (the same ones as the "Run now" button),
pressing **Send everywhere** starts the small *Upload now* run at once. Without them the video goes up
with the next Pipeline run (about 1-2 AM Nepal time).

## Good to know

- Practice mode (`PUBLISH_DRY_RUN=true`) uploads nothing; the page then says so on each platform.
- If publishing is off (`PUBLISH_ENABLED` not `true`), the page says so too. Turn it on, then press **Upload now**.
- Before the platforms approve your apps, uploads are private (YouTube, TikTok) or only visible to you (Meta Development mode).
  See social-setup.md.
- The video file is deleted from R2 after every platform you ticked has it (`DELETE_AFTER_PUBLISH`).
