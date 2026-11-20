# Connect your social channels (free)

> 👉 **New to this?** Follow the beginner step-by-step guide first:
> **[channel-and-token-guide.md](channel-and-token-guide.md)** (make the 8 accounts, get every token, test one video).

DualFlow can upload every finished video by itself: the **Nepali** video to your Nepali
channels and the **English** video to your English channels.
Everything here is **free**. The slow part is waiting for the platforms to approve your app,
so **start these steps now**.

You need **one Nepali and one English account on each platform** (8 accounts in total):

| Platform  | Nepali account               | English account              |
|-----------|------------------------------|------------------------------|
| YouTube   | a YouTube channel            | a YouTube channel            |
| Facebook  | a Facebook Page              | a Facebook Page              |
| Instagram | a Professional (Business) account, linked to the Nepali Page | the same, linked to the English Page |
| TikTok    | a TikTok account             | a TikTok account             |

> **Never paste a token or password into a chat** (not even with Claude).
> Tokens go only into GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

---

## How long each platform takes

| Platform | Can start uploading | Public videos after… | What to know |
|---|---|---|---|
| **YouTube** | Same day | Google's free **API audit** (usually a few weeks) | Before the audit, every API upload is **locked private**, and those private videos **stay private** even after the audit. Free limit: about 100 uploads a day per project. |
| **Facebook Page** | Same day | Same day for your own Pages (app in Live mode) | While the app is in *Development* mode, posts are seen only by you. |
| **Instagram** | Same day | Same day (app in Live mode) | Must be a Business account linked to a Page. About 100 API posts a day per account (Meta can lower this). Reels: 3 s to 15 min, 9:16. |
| **TikTok** | After TikTok approves the app (days to a few weeks) | After TikTok's **audit** | Before the audit, posts are **private only** and the TikTok account must be set to **private**. About 15 posts a day per account. |

---

## 1. YouTube (start today: easiest)

1. Make the two channels (Nepali and English) on your Google account, at youtube.com.
   Tip: use one Google account with two **Brand channels**, so one login covers both.
2. Verify both channels with your phone number at **youtube.com/verify**
   (this allows custom thumbnails and longer videos).
3. Go to **console.cloud.google.com** → create a project called `DualFlow`.
4. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**.
5. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type: **External**. App name: DualFlow. Your email as support and developer contact.
   - Privacy policy link: `https://<your-dashboard>/privacy`
   - Add yourself as a test user.
   - Then press **Publish app** so the status is **In production**.
     ⚠️ If it stays in **Testing**, your token stops working after **7 days**.
     (Google will show "unverified app" when you sign in. That is OK for your own use: press *Advanced → Go to DualFlow*.)
6. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
   Under *Authorized redirect URIs* add: `https://developers.google.com/oauthplayground`
   Copy the **Client ID** and **Client secret**.
7. Get a **refresh token** for each channel (do this twice: once for Nepali, once for English):
   - Open **developers.google.com/oauthplayground**
   - Gear icon (top right) → tick **Use your own OAuth credentials** → paste Client ID and secret.
   - In the left box type `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly` → **Authorize APIs**.
   - Sign in and **pick the Nepali channel** when Google asks which channel/account.
   - Press **Exchange authorization code for tokens** → copy the **Refresh token**.
   - Repeat and pick the **English** channel.
8. Save in GitHub Secrets:
   `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN_NE`, `YOUTUBE_REFRESH_TOKEN_EN`
9. **Ask for the audit** (free, so videos can be public): search "YouTube API Services Audit and Quota Extension Form",
   fill it in for the project `DualFlow`. Explain: "Private tool that uploads my own AI-narrated educational
   videos to my own two channels (Nepali and English)". Use the privacy page link above.
   Until it is approved, keep the variable `YOUTUBE_PRIVACY=private`. After approval, set it to `public`.

## 2. Facebook Pages and Instagram (one token per language covers both)

1. Make two **Facebook Pages** (Nepali and English).
2. In the Instagram app: switch both Instagram accounts to **Professional → Business**, and link each one to its Page
   (Page settings → Linked accounts → Instagram).
3. Go to **developers.facebook.com** → **My Apps → Create app** → use case **"Manage everything on your Page"**
   (or type *Business*). Add the products **Facebook Login for Business** and **Instagram** (API setup with Facebook login).
4. In **App settings → Basic**: add the privacy link `https://<your-dashboard>/privacy`,
   terms link `.../terms`, a data deletion link (use the privacy link), an icon and a category.
5. Open **Graph API Explorer** (Tools menu). Pick your app. Add these permissions:
   `pages_show_list, pages_read_engagement, pages_manage_posts, business_management, instagram_basic, instagram_content_publish`
   → **Generate Access Token** → allow both Pages and both Instagram accounts.
6. Make the token long-lived: open **Access Token Debugger** (Tools menu), paste it, press **Extend Access Token**, copy the new token.
7. Back in Graph API Explorer, paste the long-lived token and run `me/accounts?fields=name,id,access_token,instagram_business_account`.
   For each Page you get:
   - `id` → the Page id, `access_token` → the **Page token** (made from a long-lived token, it does not expire),
   - `instagram_business_account.id` → the Instagram id.
8. Save in GitHub Secrets:
   `FACEBOOK_PAGE_ID_NE`, `FACEBOOK_PAGE_TOKEN_NE`, `INSTAGRAM_USER_ID_NE`,
   `FACEBOOK_PAGE_ID_EN`, `FACEBOOK_PAGE_TOKEN_EN`, `INSTAGRAM_USER_ID_EN`
9. Test while the app is in **Development** mode (posts are seen only by you). When it works,
   switch the app to **Live** at the top of the app page. You are the app's admin, so the
   permissions above work for your own Pages without App Review. If Meta still asks for
   App Review for a permission, tell Claude and we will prepare the screen recording it needs.

## 3. TikTok (start now, it takes the longest)

1. Go to **developers.tiktok.com** → log in → **Manage apps → Connect an app**.
2. Fill in: app name DualFlow, icon, description, category, and the website/privacy/terms links
   (`https://<your-dashboard>/`, `/privacy`, `/terms`).
3. Add the products **Login Kit** and **Content Posting API** and turn on **Direct Post**.
   Scopes: `user.info.basic`, `video.publish`, `video.upload`.
4. Submit the app for review. When it is approved you can post **private** videos.
5. Then apply for the **Direct Post audit** (so videos can be public). Until then, both TikTok accounts
   must be set to **private** in the TikTok app.
6. Copy the **Client key** and **Client secret** into GitHub Secrets as `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
7. The per-account tokens (`TIKTOK_REFRESH_TOKEN_NE` / `_EN`): after approval (or in Sandbox), follow
   [channel-and-token-guide.md, Part 2D](channel-and-token-guide.md#2d-tiktok-refresh-tokens-after-approval-or-in-sandbox-on-your-mac)
   (sign in once per account, then one Terminal command).

---

## Turn it on

GitHub → **Settings → Secrets and variables → Actions → Variables** tab:

| Variable | Start with | Then |
|---|---|---|
| `PUBLISH_ENABLED` | `true` | |
| `PUBLISH_DRY_RUN` | `true` (practice: uploads nothing) | `false` when the practice run looks right |
| `PUBLISH_MODE` | `approval` (you press Approve) | `auto` for fully automatic |
| `PUBLISH_PLATFORMS` | `youtube` | `youtube,facebook,instagram` … add each one when ready |
| `PUBLISH_TIMES` | `07:00,12:30,19:00` (Nepal time) | any times you like |
| `YOUTUBE_PRIVACY` | `private` | `public` after Google's audit |
| `TIKTOK_PRIVACY` | `SELF_ONLY` | `PUBLIC_TO_EVERYONE` after TikTok's audit |

Optional: a different mode per platform, e.g. `PUBLISH_MODE_TIKTOK=manual`.

## Test it

1. **Actions → "Test my channels" → Run workflow.** It prints each channel's name (or what is missing)
   and uploads nothing. Your channels then appear on the dashboard **Channels** page.
2. With `PUBLISH_DRY_RUN=true`, the next pipeline run prints "would upload …" lines. Nothing is posted.
3. Set `PUBLISH_DRY_RUN=false`. The dashboard **Upload queue** page shows every video, its channel and its time.

## What happens automatically

- Every video goes only to the channels of **its own language**.
- **Auto** mode: finished videos join the queue by themselves. **Approval**: they wait for your *Approve*
  button on the story page. **Manual**: only the *Upload now* button uploads.
- **Bulk queue**: each channel gets at most **one video per upload time**, so ten finished videos are spread
  over the next days instead of posting all at once.
- If an upload fails it is tried again later (30 min, 1 h, 2 h, …, up to 5 tries). A full daily limit waits
  for the next day. A wrong token stops at once and shows the reason on the dashboard.
- Files are deleted from storage **only after the video is on every channel** (`DELETE_AFTER_PUBLISH`).
  If one upload fails, the files are kept.
- Uploads run inside the pipeline run (every 3 hours), so a video can go up up to 3 hours after its time.
  This costs no extra GitHub minutes. "Upload now" starts a run right away.
