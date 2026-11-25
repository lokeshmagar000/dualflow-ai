# Post everywhere with Upload-Post (the easy way)

Upload-Post (upload-post.com) is **one service** that posts your videos to **YouTube, Instagram, TikTok and Facebook**.
You sign in to each account once on Upload-Post's page. You do **not** need a Google, Meta or TikTok developer app,
and you do not wait for any app review.

DualFlow sends every video to Upload-Post, and Upload-Post puts it on your channels.

## What it costs (check the website before you pay)

| Plan | Price | Uploads | Profiles | TikTok |
|---|---|---|---|---|
| Free | $0 | 10 a month | 2 | No |
| Basic | about $24 a month ($16 if you pay yearly) | Unlimited | 5 | Yes |

Start with the **Free** plan to test. Each video on each platform counts as one upload
(1 video to YouTube + Instagram = 2 uploads). With 2 videos a day you need **Basic**.

## Steps (about 10 minutes)

### 1. Make an account
1. Open **app.upload-post.com** and sign up (Google sign-in is fine).
2. Pick the **Free** plan for now.

### 2. Copy your API key
1. In Upload-Post, open **API Keys**.
2. Press **Create API key** and copy it.
   Keep it secret, like a password.

### 3. Paste it in DualFlow
1. Open your dashboard → **Channels**.
2. In the box **"Upload-Post: one service for…"**, paste the key in **API key**.
3. Leave the two profile names empty (DualFlow makes `namaste-facts-ne` and `namaste-facts-en` for you),
   or type the names of profiles you already made on Upload-Post.
4. Press **Save and check**. You should see "Saved."

### 4. Connect your accounts
1. In the same box, next to **नेपाली**, press **Connect accounts**.
2. Upload-Post's page opens. Connect the **Nepali** accounts: YouTube channel *Namaste Facts नेपाली*, the Nepali Instagram, and (on Basic) the Nepali TikTok.
3. Press **Back to DualFlow**. The box now shows ✓ next to each connected account.
4. Do the same next to **English** with the English accounts.

If the Connect button shows an error, connect on the website instead:
**app.upload-post.com → Manage Users → your profile → Connect**, then press **Refresh** in the DualFlow box.

> 💡 Instagram must be a **Professional** account (Creator or Business). Facebook needs a real **Facebook Page**;
> a personal profile in Professional mode is not a Page. This is Meta's rule, for every service.

### 5. Test
1. On **Channels**, section **3. Check**, press **Test now**. Every account should show ✓.
2. Open **Ready to upload** and press **Upload to my channels** on one video.
   After a few minutes it shows as uploaded, with a link.

### 6. Turn on Auto upload
On **Channels → 1. Auto upload**, pick **Fully automatic**. New videos now post by themselves at 7:00 AM, 12:30 PM and 7:00 PM Nepal time.

## Good to know
- **Upload-Post wins.** When Upload-Post has an account for a platform, DualFlow uses it for that platform.
  Platforms you did not connect there still use the old direct Connect buttons (if you set them up).
- **Videos are public.** YouTube videos go up as *public* (set `UPLOAD_POST_YOUTUBE_PRIVACY=unlisted` or `private` in GitHub Variables to change it).
  TikTok posts from Auto upload are *public* (`UPLOAD_POST_TIKTOK_PRIVACY` changes it). The TikTok upload window on the Ready page lets you pick each time.
- **AI label.** YouTube and TikTok posts are marked as AI-made content, like before.
- **No double posts.** If a run is cut off and tries again, Upload-Post sees it is the same upload and posts it only once.
- **Monthly limit used up?** The upload waits and tries again the next day. It is not counted as a failure.
- **Stop using it:** press **Stop using Upload-Post** in the box.

## 📚 New words
- **Service**: a company's website or tool that does a job for you.
- **API key**: a secret password that lets one program (DualFlow) use another (Upload-Post).
- **Profile**: one group of social accounts inside Upload-Post. We use one for Nepali and one for English.
- **Public / unlisted / private**: everyone can find it / only people with the link / only you.
