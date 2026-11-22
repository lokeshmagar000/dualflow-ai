# Make your channels and get your tokens (beginner guide)

> ✨ **New, easier way:** connect your channels with buttons on the dashboard's **Channels** page, no tokens to copy.
> Follow [easy-auto-upload.md](easy-auto-upload.md). This page is still useful for making the accounts (Part 1) and the TikTok app (Part 2C).


This guide takes you from **zero** to **your first video uploaded by DualFlow**.
Everything is **free**. Do the parts in order. Each step is short.

Your brand: **Namaste Facts**

| Language | Name on every platform |
|---|---|
| English | **Namaste Facts** |
| Nepali | **Namaste Facts नेपाली** (if a platform refuses the Nepali letters, use **Namaste Facts Nepali**) |

So you will make **8 accounts**: 2 on YouTube, 2 on Facebook, 2 on Instagram, 2 on TikTok.

> 🔒 **Golden rule:** a token is like a password. **Never paste a token, secret or password into a chat**
> (not even with Claude), and never put it in a file in the repo.
> Tokens go **only** into GitHub Secrets (Part 0, step 3).

**How long it takes:** YouTube, Facebook and Instagram can be done in **one afternoon**.
TikTok needs TikTok to approve your app first (a few days to a few weeks), so **start the TikTok app early**.

---

## Part 0. Get ready (10 minutes)

1. **One Google account (Gmail)** for both YouTube channels. Turn on 2-Step Verification
   (myaccount.google.com → Security). Platforms trust accounts with it.
2. **Your dashboard address.** First put the dashboard online with
   [put-dashboard-online.md](put-dashboard-online.md) (free, about 20 minutes). Render then shows your own address;
   it looks like `https://dualflow-web.onrender.com` but may have extra letters, like `https://dualflow-web-k3x9.onrender.com`.
   Open `https://<your-dashboard>/privacy` in your browser. You should see the privacy page.
   In the TikTok and R2 steps below, if your address is different, replace `dualflow-web.onrender.com` with yours.
   Google, Meta and TikTok all ask for this link. In this guide, `<your-dashboard>` means your address.
3. **Where tokens go (GitHub Secrets):**
   github.com → your repo **dualflow-ai** → **Settings** → **Secrets and variables** → **Actions** →
   **Secrets** tab → **New repository secret** → type the **Name** exactly as this guide says → paste the value → **Add secret**.
   Names are **CAPITAL letters** and must match **exactly** (`_NE` = Nepali, `_EN` = English).
4. **Where switches go (GitHub Variables):** the same page, but the **Variables** tab → **New repository variable**.
5. Keep a notebook (paper is fine) with a checkbox for each step below.

---

## Part 1. Make the 8 accounts

### 1A. YouTube (2 channels on one Google account)

1. Go to **youtube.com** and sign in with your Gmail.
2. Click your picture (top right) → **Settings** → **Add or manage your channel(s)** → **Create a channel**.
   This makes a **Brand channel**: a channel with its own name, inside your one Google account.
3. Name it **Namaste Facts**. Pick a handle, e.g. `@NamasteFacts` (if it is taken, try `@NamasteFactsEN`).
4. Do steps 2-3 again for **Namaste Facts नेपाली**, handle e.g. `@NamasteFactsNepali`.
5. **Verify both channels** with your phone: go to **youtube.com/verify** (switch channel first, top-right picture → *Switch account*).
   This unlocks custom thumbnails and videos longer than 15 minutes.
6. Add the logo and banner (YouTube Studio → **Customization** → **Branding**).
   Use the files from the logo you pick in `logos/round-1/` (profile = round picture, banner = wide picture).

### 1B. Facebook Pages (2 Pages on your own Facebook profile)

1. Sign in to **facebook.com** with your own profile (Pages always live under a real person's profile).
2. Menu → **Pages** → **Create new Page**.
3. Name: **Namaste Facts**. Category: *Education website* or *Media/news company*. Add the logo and banner → **Create**.
4. Do it again for **Namaste Facts नेपाली**.
5. Check you are the **admin** of both Pages (switch into the Page → Settings → **Page access** → you have *Full control*).

### 1C. Instagram (2 Professional accounts, each linked to its Page)

1. In the Instagram phone app, make the first account: **Namaste Facts** (username e.g. `namastefacts`).
2. Make the second one: Profile → your username at the top → **Add account** → **Namaste Facts नेपाली** (e.g. `namastefacts.nepali`).
   Each new account may ask for its own email or phone number.
3. On **each** account: **Settings** → **Account type and tools** → **Switch to professional account** → choose **Business**
   (Creator also works) → category *Education* → finish.
4. **Link each Instagram to its own Facebook Page** (very important, this is how the app finds it):
   Instagram → **Settings** → **Accounts Center** → **Accounts** → **Add accounts** → add your Facebook profile,
   then in Facebook: Page → **Settings** → **Linked accounts** → **Instagram** → **Connect** and pick the **matching** Instagram.
   English Page ↔ English Instagram. Nepali Page ↔ Nepali Instagram.

### 1D. TikTok (2 accounts)

1. In the TikTok app, sign up the first account: **Namaste Facts** (e.g. `@namastefacts`).
2. Profile → your name at the top → **Add account** → sign up **Namaste Facts नेपाली** (e.g. `@namastefacts.nepali`).
   Each TikTok account needs **its own email or phone number**.
3. On **both** accounts: **Settings and privacy** → **Privacy** → turn **Private account ON**.
   Before TikTok audits your app, it only lets apps post to **private** accounts (see Part 2D).
   You can switch back to public after the audit.

---

## Part 2. Get the tokens (one platform at a time)

Here is **every** Secret DualFlow reads. You will fill this table step by step.

| Secret name | What it is | From |
|---|---|---|
| `YOUTUBE_CLIENT_ID` | your Google app's id | 2A step 6 |
| `YOUTUBE_CLIENT_SECRET` | your Google app's password | 2A step 6 |
| `YOUTUBE_REFRESH_TOKEN_EN` | the key for the English channel | 2A step 7 |
| `YOUTUBE_REFRESH_TOKEN_NE` | the key for the Nepali channel | 2A step 7 |
| `FACEBOOK_PAGE_ID_EN` / `FACEBOOK_PAGE_ID_NE` | each Page's number | 2B step 8 |
| `FACEBOOK_PAGE_TOKEN_EN` / `FACEBOOK_PAGE_TOKEN_NE` | each Page's key (also used for Instagram) | 2B step 8 |
| `INSTAGRAM_USER_ID_EN` / `INSTAGRAM_USER_ID_NE` | each Instagram account's number | 2B step 8 |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | your TikTok app's id and password | 2C step 7 |
| `TIKTOK_REFRESH_TOKEN_EN` / `TIKTOK_REFRESH_TOKEN_NE` | the key for each TikTok account | 2D |

(You already have the R2, Gemini and Neon secrets from before. Don't change them.)

### 2A. YouTube tokens (about 30 minutes, start here)

1. Go to **console.cloud.google.com**, sign in with the same Gmail.
2. Top bar → project list → **New project** → name `DualFlow` → **Create**. Make sure `DualFlow` is selected at the top.
3. Menu ☰ → **APIs & Services** → **Library** → search **YouTube Data API v3** → **Enable**.
4. Menu ☰ → **Google Auth Platform** (older name: *OAuth consent screen*) → **Get started**:
   - App name: `DualFlow`. Support email: your Gmail.
   - Audience: **External**.
   - Contact email: your Gmail → agree → **Create**.
   - **Branding** page: add the privacy link `https://<your-dashboard>/privacy` and terms link `https://<your-dashboard>/terms` → Save.
   - **Audience** page: press **Publish app** → confirm. Status must say **In production**.
     ⚠️ If it says **Testing**, your token **stops working after 7 days**.
5. You do **not** need Google's app verification for your own use. When you sign in later, Google shows
   *"Google hasn't verified this app"*: click **Advanced** → **Go to DualFlow (unsafe)**. It is safe, because it is your own app.
6. **Clients** (or *Credentials*) → **Create client** → type **Web application** → name `DualFlow web`.
   Under **Authorized redirect URIs** → **Add URI** → `https://developers.google.com/oauthplayground` → **Create**.
   Copy the **Client ID** and **Client secret** → save them as Secrets `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
7. Get one **refresh token per channel** (do this **2 times**):
   1. Open **developers.google.com/oauthplayground**.
   2. ⚙️ gear (top right) → tick **Use your own OAuth credentials** → paste your Client ID and Client secret → close.
   3. In the left box **"Input your own scopes"** paste:
      `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly`
      → **Authorize APIs**.
   4. Pick your Gmail. Google asks **which channel** → pick **Namaste Facts** (English) → Advanced → Go to DualFlow → **Continue/Allow**.
   5. Back in the playground press **Exchange authorization code for tokens**.
   6. Copy the **Refresh token** (starts with `1//`) → save as Secret `YOUTUBE_REFRESH_TOKEN_EN`.
   7. Now do it again: press the **Step 1** title, **Authorize APIs** again, and this time pick **Namaste Facts नेपाली**
      → save its refresh token as `YOUTUBE_REFRESH_TOKEN_NE`.
8. **Ask for the free audit** (so videos can be public): search for **"YouTube API Services Audit and Quota Extension Form"**,
   fill it for the project `DualFlow`. Say: *"A private tool that uploads my own AI-narrated educational videos to my own two
   channels (Nepali and English). Privacy policy: (your privacy link)."*
   Until Google approves it, keep the variable `YOUTUBE_PRIVACY=private`.
   ⚠️ Videos uploaded **before** the audit stay **private forever** (you can re-upload them later).

### 2B. Facebook and Instagram tokens (about 40 minutes, one token covers both)

1. Go to **developers.facebook.com** → **Get started** → sign in with your Facebook profile → verify your phone/email.
   This makes you a (free) Meta developer.
2. **My Apps** → **Create app** → name `DualFlow`, your email → **Next**.
3. Use case: **Manage everything on your Page** (it may be called *"Manage messaging & content on Facebook Pages"*),
   and, if offered on the same screen, also **Manage messaging & content on Instagram** → Next.
   If you are asked for a business portfolio, pick **"I don't want to connect a business portfolio yet"** → **Create app**.
4. **App settings → Basic**: fill
   - Privacy Policy URL: `https://<your-dashboard>/privacy`
   - Terms of Service URL: `https://<your-dashboard>/terms`
   - User data deletion: choose *Data deletion instructions URL* → `https://<your-dashboard>/privacy`
   - App icon (1024×1024, your logo) and category *Education* → **Save changes**.
5. Menu **Tools** → **Graph API Explorer**. On the right:
   - **Meta App**: `DualFlow`. **User or Page**: *Get User Access Token*.
   - **Permissions**: add all of these:
     `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`,
     `instagram_basic`, `instagram_content_publish`
   - Press **Generate Access Token** → a window opens → **Opt in to all current and future Pages** (or tick both Pages
     and both Instagram accounts) → **Continue/Save**.
6. Make it long-lived: **Tools** → **Access Token Debugger** → paste the token → **Debug** → at the bottom press
   **Extend Access Token** → copy the **new** long token (it is valid about 60 days).
7. Back in **Graph API Explorer**: paste the long token into the *Access Token* box, and in the address box type:
   `me/accounts?fields=name,id,access_token,instagram_business_account` → **Submit**.
8. You see two blocks, one per Page. For **Namaste Facts** (English):
   - `id` → Secret `FACEBOOK_PAGE_ID_EN`
   - `access_token` → Secret `FACEBOOK_PAGE_TOKEN_EN` (a Page token made from a long token **does not expire**)
   - `instagram_business_account` → `id` → Secret `INSTAGRAM_USER_ID_EN`

   Do the same with the **Namaste Facts नेपाली** block → `FACEBOOK_PAGE_ID_NE`, `FACEBOOK_PAGE_TOKEN_NE`, `INSTAGRAM_USER_ID_NE`.
   No `instagram_business_account`? The Instagram is not linked to that Page or is not Professional: go back to Part 1C step 3-4,
   then repeat steps 5-8.
9. Check the token: paste a Page token into the **Access Token Debugger**. **Expires: Never** is what you want.
10. **Development vs Live:** while the app is in *Development* mode, posts are seen **only by you**. That is fine for the test
    in Part 4. When the test works, switch the app to **Live** (toggle/“Publish” at the top of the app page). You are the
    app's admin, so these permissions work on **your own** Pages without App Review. If Meta still asks for review, tell Claude.

### 2C. TikTok app (10 minutes now, then wait for approval)

1. Go to **developers.tiktok.com** → **Log in** (use the TikTok account **Namaste Facts**) → accept the developer terms.
2. **Manage apps** → **Connect an app** (or *Create app*) → pick **Individual** if asked.
3. Fill the app details:
   - Name `DualFlow`, icon (your logo), category *Education*, description:
     *"Uploads my own AI-narrated educational videos to my own two TikTok accounts."*
   - **Web/Desktop** platform. Website: `https://<your-dashboard>/`, Terms: `https://<your-dashboard>/terms`, Privacy: `https://<your-dashboard>/privacy`.
4. **Add products**: **Login Kit** and **Content Posting API**. In Content Posting API, turn **Direct Post** on.
5. **Login Kit → Redirect URI**: add `https://<your-dashboard>/privacy` (exactly this, you need it in 2D).
6. **Scopes**: tick `user.info.basic`, `video.upload`, `video.publish`.
7. Copy **Client key** and **Client secret** (on the app page) → Secrets `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`.
8. **Submit for review.** TikTok wants a short **demo video** of the app: a screen recording of the dashboard's
   Bulk upload page (pick video → caption → Send everywhere) is enough. Review takes a few days to a few weeks.
9. **Want to test sooner?** Many new apps start in **Sandbox** mode. On the app page, look for **Sandbox** →
   **Target users** → add both TikTok accounts. Then you can already do 2D and post **private** test videos.
10. After approval, apply for the **Direct Post audit** (so posts can be public). Until it passes, keep both accounts **private**
    and the variable `TIKTOK_PRIVACY=SELF_ONLY`.

### 2D. TikTok refresh tokens (after approval, or in Sandbox; on your Mac)

You do this **2 times**: once signed in as **Namaste Facts**, once as **Namaste Facts नेपाली**.
Use a **private/incognito browser window** each time, so the right account signs in.

1. Make your sign-in link. Copy this, put your **Client key** and dashboard address in it:

   ```
   https://www.tiktok.com/v2/auth/authorize/?client_key=YOUR_CLIENT_KEY&scope=user.info.basic,video.upload,video.publish&response_type=code&state=namaste&redirect_uri=https%3A%2F%2Fdualflow-web.onrender.com%2Fprivacy
   ```

   (`%3A%2F%2F` means `://` and `%2F` means `/`. If your dashboard address is different, change only `dualflow-web.onrender.com`.)
2. Open the link in the private window → log in as the English account → **Authorize**.
3. You land on your privacy page. Look at the **address bar**: it ends with `?code=XXXX&scopes=...&state=namaste`.
   Copy only the part **after `code=` and before `&scopes`**. This code works for **a few minutes, once**, so be quick.
4. Open **Terminal** on your Mac (Cmd+Space → type *Terminal*). Paste this, with your 3 values put in, and press Enter:

   ```bash
   curl -s -X POST https://open.tiktokapis.com/v2/oauth/token/ \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_key=YOUR_CLIENT_KEY" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=THE_CODE_YOU_COPIED" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=https%3A%2F%2Fdualflow-web.onrender.com%2Fprivacy"
   ```

   *How it works:* `curl` sends a message to TikTok's server (`-X POST`), with your app's id and password and the one-time code.
   TikTok answers with JSON (text in `{ }`).
5. In the answer find `"refresh_token":"..."` → copy the value between the quotes → Secret `TIKTOK_REFRESH_TOKEN_EN`.
   An `error` instead? The code was too old or already used: start again at step 2.
6. Close the private window, open a new one, and do steps 2-5 as **Namaste Facts नेपाली** → `TIKTOK_REFRESH_TOKEN_NE`.
7. Close Terminal (or type `clear`) so the token is not left on screen. A TikTok refresh token lasts about **1 year**;
   if the GitHub log ever says *"TikTok gave a new refresh token"*, repeat this part.

---

## Part 3. Let your browser send videos to R2 (CORS, 3 minutes)

This is needed for the dashboard's **Bulk upload** page.

1. **dash.cloudflare.com** → left menu **R2 Object Storage** → click your bucket (`dualflow`).
2. **Settings** tab → **CORS Policy** → **Add CORS policy** (or *Edit*).
3. Delete what is in the box and paste this (change the address to **your** dashboard, no `/` at the end):

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

   *How it works:* it tells R2 "accept file uploads (`PUT`) that come from **this** website only". Other websites stay blocked.
4. **Save.** Without this, Bulk upload says *"The video could not be sent"*.

---

## Part 4. Test with ONE video (start with YouTube only)

1. GitHub → **Settings → Secrets and variables → Actions → Variables** tab. Add:

   | Variable | Value for the test |
   |---|---|
   | `PUBLISH_ENABLED` | `true` |
   | `PUBLISH_DRY_RUN` | `true` (practice, posts nothing) |
   | `PUBLISH_MODE` | `approval` |
   | `PUBLISH_PLATFORMS` | `youtube` |
   | `YOUTUBE_PRIVACY` | `private` |
   | `TIKTOK_PRIVACY` | `SELF_ONLY` |

2. GitHub → **Actions** → **Test my channels** → **Run workflow** → wait about 1 minute → open the run.
   It prints each channel's name, or exactly which Secret is missing or wrong. **It uploads nothing.**
   Fix anything red, run it again until YouTube shows both channel names.
3. Practice run: Actions → **Pipeline** → **Run workflow**. In the log you should see *"would upload …"* lines. Nothing is posted.
4. Real test: set `PUBLISH_DRY_RUN` to `false`. Open the dashboard → **Bulk upload** → drop one short finished video
   (e.g. one of your test videos), pick **English**, write a title → tick **YouTube** only → **Send everywhere**.
5. Wait 2-5 minutes. The list shows **uploaded** with a link. Open it: the video is on **Namaste Facts** as **private**. 🎉
6. Now add the other platforms one by one in `PUBLISH_PLATFORMS`, testing each with one video:
   `youtube,facebook` → `youtube,facebook,instagram` → `youtube,facebook,instagram,tiktok` (TikTok after 2D).
7. Try one **Nepali** video too, to check it goes only to the **नेपाली** channels.

---

## Part 5. Checklist

- [ ] Dashboard `/privacy` and `/terms` pages open
- [ ] 2 YouTube channels made and phone-verified
- [ ] 2 Facebook Pages made, I am admin
- [ ] 2 Instagram accounts are Business/Creator and linked to the matching Page
- [ ] 2 TikTok accounts made and set to private
- [ ] Google app is **In production** (not Testing)
- [ ] Secrets: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN_EN`, `YOUTUBE_REFRESH_TOKEN_NE`
- [ ] Secrets: `FACEBOOK_PAGE_ID_EN/NE`, `FACEBOOK_PAGE_TOKEN_EN/NE`, `INSTAGRAM_USER_ID_EN/NE`
- [ ] Secrets: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` (and later `TIKTOK_REFRESH_TOKEN_EN/NE`)
- [ ] YouTube audit form sent
- [ ] TikTok app submitted for review
- [ ] R2 CORS policy saved
- [ ] "Test my channels" is green
- [ ] One video uploaded on YouTube, then each other platform

## Common errors and what they mean

| What you see | Why | Fix |
|---|---|---|
| YouTube: `invalid_grant` or "token expired" after a week | Google app still in **Testing** | Publish the app (2A step 4), then make new refresh tokens (2A step 7) |
| YouTube video is **private** and can't be made public | No audit yet: Google locks API uploads before the audit | Wait for the audit, set `YOUTUBE_PRIVACY=public`, upload again |
| YouTube: `quotaExceeded` / daily limit | Free limit of the project per day | Nothing to do: DualFlow waits for the next day by itself |
| YouTube video went to the wrong channel | You picked the wrong channel in the playground | Redo 2A step 7 and replace that secret |
| Facebook/Instagram posts only you can see | App is in **Development** mode | Switch the app to **Live** (2B step 10) |
| `(#200) permissions error` / `(#10)` | A permission was not ticked, or a Page/Instagram was not allowed | Redo 2B steps 5-8 and tick all six permissions and both Pages |
| No `instagram_business_account` | Instagram is personal, or not linked to that Page | Part 1C steps 3-4 |
| Instagram: "media not ready" or too many posts | Video still processing, or the ~100 posts/day limit | DualFlow tries again later by itself |
| Instagram refuses the video | Reels must be 3 s to 15 min and under 300 MB | The Bulk upload page shows this in red before sending |
| TikTok: `unaudited_client_can_only_post_to_private_accounts` | Account is public and the app is not audited | Set the TikTok account to **private**, keep `TIKTOK_PRIVACY=SELF_ONLY` |
| TikTok: `invalid_grant` / `code expired` in Terminal | The code is used once and lives only a few minutes | Start 2D again from step 2 |
| TikTok: only a few accounts can post | Unaudited apps are limited to a small number of accounts per day | Fine for your 2 accounts; the audit removes it |
| Bulk upload: "The video could not be sent" | R2 CORS missing or wrong address | Part 3 (exact dashboard address, no `/` at the end) |
| "Test my channels" says a secret is missing | Name typed differently | Names must match **exactly**, CAPITAL letters, `_EN` / `_NE` |

**Free-tier facts to remember:** all of this costs $0. The limits are: YouTube about 100 uploads a day per Google project
and private-only before the audit; Instagram about 100 posts a day per account; TikTok about 15 posts a day per account
and private-only before the audit; Meta posts are only visible to you until the app is Live.

---

## 📚 New words

| Word | Meaning |
|---|---|
| **Token** | A long secret text that lets an app act for your account, like a key card for one door. |
| **Refresh token** | A long-lasting token. The app uses it to get a new short token each time it uploads. |
| **Client ID / Client key** | The public name of your app at Google or TikTok. |
| **Client secret** | The password of your app. Keep it secret. |
| **Credentials** | The set of ids, secrets and tokens that prove who you are. |
| **OAuth** | The standard way to say "yes, this app may use my account" without giving it your password. |
| **Consent screen** | The page that asks you "Allow DualFlow to upload videos?". |
| **Scope / Permission** | Exactly what the app may do, e.g. *upload videos* but not *delete the channel*. |
| **Redirect URI** | The web address you are sent back to after you press *Allow*. |
| **Brand channel** | A YouTube channel with its own name, owned by your Google account. |
| **Professional account** | An Instagram Business or Creator account. Only these can be used by apps. |
| **Audit** | A check by the platform before your app may post public videos. |
| **Sandbox** | A safe practice mode where only test accounts can be used. |
| **Long-lived** | Lasts a long time (weeks, or never expires) instead of one hour. |
| **CORS** | A browser safety rule: a website may send files to storage only if the storage says it is allowed. |
| **Dry run** | A practice run that shows what would happen but changes nothing. |
| **Quota** | How much you may use a free service per day. |
| **Terminal** | The Mac app where you type commands instead of clicking. |
| **curl** | A Terminal command that sends a message to a web server. |

See also: [social-setup.md](social-setup.md) (short version and the switches) and [bulk-upload.md](bulk-upload.md) (the one-click upload page).
