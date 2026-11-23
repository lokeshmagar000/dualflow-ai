# Easy automatic uploads (one-click Connect buttons)

This is the **easy way** to make DualFlow upload your videos **by itself**.
No more copying tokens, no Graph API Explorer, no OAuth Playground, no Terminal.

You do 3 things, once:

1. Make a small free "app" on each platform and paste its **two keys** into the dashboard.
2. Press **Connect** and then **Allow**, like signing in to a website.
3. Turn **Auto upload** on.

After that, every new video goes up at **7:00 AM, 12:30 PM and 7:00 PM** (Nepal time), one video per channel each time.

Everything here is **free**. Everything happens on your dashboard's **Channels** page.

> 🔒 Never paste a key or secret into a chat (not even with Claude). Paste it only into the dashboard boxes.
> The dashboard locks (encrypts) every secret before saving it, and never shows it again.

---

## Why can't it be ONE button with no setup?

Google, Facebook and TikTok only let an **app** upload videos. An app needs an id and a secret.
Big tools (like Buffer) have their own app, but their free plans allow only about 10-20 posts a **month**.
DualFlow makes about **16 uploads a day** (2 stories × 2 languages × 4 platforms), so a free plan of
another tool is far too small. Your own app is free and has no such limit, so you make it once.

**Platform rules nobody can skip** (they are the same for every tool):

| Platform | Rule for new apps | What it means for you |
|---|---|---|
| YouTube | Before Google's free **audit**, videos uploaded by an app stay **private** | Send the audit form on day 1 (Part 2, step 9) |
| Facebook / Instagram | While the app is in **Development** mode, only you see the posts | Switch the app to **Live** (Part 3, step 11) |
| TikTok | TikTok must **approve** the app; before its audit, posts are **private** | Do TikTok last. Until then, post TikTok by hand from **Ready to upload** |

So the best order is: **Facebook + Instagram first** (public soonest), then **YouTube**, then **TikTok**.

---

## Part 1. One check on Render (2 minutes)

The dashboard locks tokens with your Cloudflare R2 secret, which you already have.

1. Open **dashboard.render.com** → click **dualflow-web** → **Environment**.
2. Look for `R2_SECRET_ACCESS_KEY`. It must be there, with the **same value** as the GitHub Secret of the same name.
   (You added it when you fixed Download. If it is missing, add it now and press **Save**.)
3. When this update (the pull request) is merged, Render updates the dashboard by itself. Wait until it says **Live**.
4. Open your dashboard → **Channels**. You see three boxes: **YouTube**, **Facebook + Instagram**, **TikTok**.
   Each box shows a **Return address** with a **Copy** button. You need it below.

---

## Part 2. YouTube (about 20 minutes)

You need: one Gmail that owns both channels (Namaste Facts and Namaste Facts नेपाली).

1. Go to **console.cloud.google.com** and sign in with that Gmail.
2. Top bar → project list → **New project** → name `DualFlow` → **Create**. Check that `DualFlow` is selected at the top.
3. Menu ☰ → **APIs & Services** → **Library** → search **YouTube Data API v3** → **Enable**.
4. Menu ☰ → **Google Auth Platform** (older name: *OAuth consent screen*) → **Get started**:
   App name `DualFlow`, support email = your Gmail, Audience **External**, contact email = your Gmail → **Create**.
5. **Branding**: add `https://<your-dashboard>/privacy` and `https://<your-dashboard>/terms` → **Save**.
6. **Audience** → press **Publish app** → confirm. It must say **In production**.
   ⚠️ If it says *Testing*, the connection stops working after 7 days.
7. **Clients** → **Create client** → type **Web application** → name `DualFlow web`.
   Under **Authorized redirect URIs** press **Add URI** and paste the YouTube **Return address** from the Channels page
   (it ends with `/connect/youtube/callback`) → **Create**.
8. Google shows **Client ID** and **Client secret**. On the Channels page, YouTube box → **Step A** → paste both → **Save keys**.
   The badge turns green: **saved**.
9. Press **Connect** next to **नेपाली**. Google opens:
   - Pick your Gmail.
   - Google asks **which account or channel**: pick **Namaste Facts नेपाली** (not your own name).
   - *"Google hasn't verified this app"* → **Advanced** → **Go to DualFlow (unsafe)**. It is safe: it is **your own** app.
   - Tick the boxes → **Continue**.
   - You come back to Channels with a green **Connected 🎉** note and the channel name.
10. Press **Connect** next to **English** and do the same, picking **Namaste Facts**.
11. **Send the free audit form** so your videos can be public: search for
    **"YouTube API Services Audit and Quota Extension Form"** and fill it for project `DualFlow`. You can write:
    *"A private tool that uploads my own AI-narrated educational videos to my own two channels (Nepali and English).
    Privacy policy: https://&lt;your-dashboard&gt;/privacy."*
    Until Google says yes, YouTube uploads stay private. (You can keep YouTube on: it is good practice, or
    leave YouTube to later and upload YouTube videos by hand from **Ready to upload**.)

---

## Part 3. Facebook + Instagram (about 20 minutes, ONE Connect for all four)

Before you start: both Instagram accounts must be **Professional** (Business or Creator) and each must be
**linked to its own Facebook Page**. See [channel-and-token-guide.md](channel-and-token-guide.md), part 1C, steps 3-4.

1. Go to **developers.facebook.com** → **Get started** → sign in with your own Facebook profile (the admin of both Pages).
2. **My Apps** → **Create app** → name `DualFlow`, your email → **Next**.
3. Use case: **Manage everything on your Page** (it may be called *"Manage messaging & content on Facebook Pages"*).
   If **Manage messaging & content on Instagram** is offered on the same screen, tick it too → **Next**.
   Asked for a business portfolio? Pick **"I don't want to connect a business portfolio yet"** → **Create app**.
4. **App settings → Basic**: fill Privacy Policy URL `https://<your-dashboard>/privacy`, Terms of Service URL
   `https://<your-dashboard>/terms`, Data deletion instructions URL `https://<your-dashboard>/privacy`,
   app icon (your logo, 1024×1024), category *Education* → **Save changes**.
5. Still on **Basic**: copy **App ID** and **App secret** (press *Show*).
6. Find the login settings. The left menu shows **one** of these:
   - **Facebook Login** → **Settings**, or
   - **Facebook Login for Business** → **Settings**.

   (Not there? Left menu → **Add product** or **Use cases → Customize** → add **Facebook Login**.)
   In **Valid OAuth Redirect URIs** paste the **Return address** from the Facebook + Instagram box
   (it ends with `/connect/meta/callback`) → **Save changes**.
7. **Only if you have "Facebook Login for Business":** open its **Configurations** → **Create configuration** →
   name `DualFlow` → token type **User access token** → tick these permissions:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `business_management`, `instagram_basic`, `instagram_content_publish`
   → **Create**. Copy the **Configuration ID** (a number).
8. On the Channels page, Facebook + Instagram box → **Step A** → paste **App ID**, **App secret**
   (and the **Configuration ID** if you made one in step 7) → **Save keys**.
9. Press **Connect Facebook + Instagram**. Facebook opens:
   - Choose **Opt in to all current and future Pages** (or tick **both** Pages and **both** Instagram accounts).
   - Press **Continue** / **Save** until you come back to the dashboard.
10. Check the box: **नेपाली** should show *Namaste Facts नेपाली* and its Instagram, **English** should show *Namaste Facts*.
    DualFlow guesses the language from the Page name (it looks for **नेपाली** or **Nepali**).
    Wrong way round? Press **Wrong language? Swap Nepali ↔ English**.
11. **Make posts public:** at the top of the app page on developers.facebook.com, switch the app from **Development** to **Live**
    (or **Publish**). You are the app's admin, so this works on your **own** Pages without App Review.
    If Meta still asks for a review, tell Claude.

The Page keys made this way **do not expire**, so you do this only once.

---

## Part 4. TikTok (do this last)

1. Make the app as in [channel-and-token-guide.md](channel-and-token-guide.md), part 2C, with ONE change:
   in **Login Kit → Redirect URI**, paste the TikTok **Return address** from the Channels page
   (it ends with `/connect/tiktok/callback`). You can keep the old `/privacy` one too.
2. Submit the app for review (part 2C step 8). For a quicker test, use **Sandbox** and add both TikTok accounts as target users.
3. Keep both TikTok accounts **private** until TikTok's audit passes.
4. When the app is approved (or in Sandbox): Channels page, TikTok box → **Step A** → paste **Client key** and **Client secret** → **Save keys**.
5. TikTok signs in with whatever account is open in your browser. So:
   - Open **tiktok.com**, switch to **Namaste Facts नेपाली** → back on Channels press **Connect** next to **नेपाली** → **Authorize**.
   - Open **tiktok.com**, switch to **Namaste Facts** → press **Connect** next to **English** → **Authorize**.
6. TikTok sometimes gives a new key. DualFlow now **saves it by itself**, so you don't have to redo this every year.

No TikTok yet? That is fine. The other platforms upload by themselves, and TikTok videos wait on **Ready to upload** for you.

---

## Part 5. Turn it on (5 minutes, then wait for one run)

1. Channels page → **3. Check** → **Test now**. Every connected channel should show ✓ and its name.
   A ✕ shows what is wrong (see the table below).
2. **1. Auto upload** → pick **Practice**.
3. Wait for the next upload time (7:00 AM, 12:30 PM or 7:00 PM). Then on GitHub: **Actions** → **Upload now** → open the newest run →
   **Upload to social channels**. You should see lines like *"would upload … to YouTube (Nepali)"*. Nothing was posted.
   (Want to see it sooner? Press **Run workflow** on **Upload now** yourself.)
4. Happy? Pick **Fully automatic**. 🎉 From now on:
   - 2:00 AM and 4:00 AM: DualFlow makes the videos (like now).
   - 7:00 AM, 12:30 PM, 7:00 PM: one video goes up on each connected channel.
   - **Upload queue** shows what goes where and when. **Channels** shows how many went up.
5. Prefer to check each video first? Pick **Ask me first**: each video waits until you press **Approve** on it.

You do **not** need the old GitHub variables (`PUBLISH_ENABLED`, `PUBLISH_DRY_RUN`, `PUBLISH_MODE`) any more:
the switch on the Channels page replaces them. Tokens you saved before as GitHub Secrets still work;
when a channel is connected on the dashboard too, the dashboard one is used.

---

## Part 6. Upload one video by hand (the Upload buttons)

Don't want to wait for Auto upload? Open **Ready to upload**:

- **Upload to my Nepali channels** / **Upload to my English channels** under each video sends that video
  only to the connected channels of **its** language (Nepali video → Namaste Facts नेपाली).
- **Upload all to my channels** (top of the page) sends every waiting video.
- Under each video, **Sent to your channels** shows *in the queue*, *uploading…*, *uploaded ✓* (with an **open** link) or *failed* (with the reason).

The buttons work even when Auto upload is **Off** (Off only means "nothing uploads by itself").
In **Practice** they post nothing.

**Right away, or at the next upload time?**
If Render has `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` (see [automatic-videos.md](automatic-videos.md)), the upload starts
right away and takes 2-5 minutes. Without them it goes up at the next upload time (about 7:05 AM, 12:35 PM or 7:05 PM).

---

## Common problems

| What you see | Why | Fix |
|---|---|---|
| **"One setting is missing on Render"** | `R2_SECRET_ACCESS_KEY` is not on dualflow-web | Part 1 |
| Google: **redirect_uri_mismatch** | The return address in Google is not exactly the same | Copy it again with the **Copy** button (Part 2, step 7). No space, no `/` at the end |
| Google: **"Google does not know this Client ID"** | Wrong or old keys | Copy Client ID and secret again → Step A → **Save new keys** |
| YouTube: the wrong channel got connected | You picked your own name in Google's list | Press **Reconnect** and pick the Namaste Facts channel |
| YouTube video is **private** | No audit yet | Send the audit form (Part 2, step 11) and wait |
| YouTube stops after 7 days | Google app is in *Testing* | Part 2, step 6 → **Publish app**, then **Reconnect** |
| Facebook: **"URL blocked"** or **"Can't load URL"** | The return address is not in Valid OAuth Redirect URIs | Part 3, step 6 |
| Facebook: **"Invalid Scopes"** | Your app uses Facebook Login for Business | Make a Configuration (Part 3, step 7), paste its ID in Step A |
| **"Instagram: not linked to this Page"** | Instagram is personal, or not linked to that Page | channel-and-token-guide.md part 1C, then **Reconnect Facebook + Instagram** |
| Facebook/Instagram posts only you can see | Meta app is in Development mode | Part 3, step 11 → **Live** |
| TikTok: **unaudited_client_can_only_post_to_private_accounts** | Account is public, app not audited | Set the TikTok account to private |
| GitHub log: **"locked with a different key"** | `R2_SECRET_ACCESS_KEY` on Render is not the same as in GitHub | Make them the same, then press **Reconnect** once |
| Nothing uploads at 7:00 | GitHub sometimes starts scheduled runs late (up to an hour) | Wait; or Actions → **Upload now** → **Run workflow** |

**Free GitHub minutes:** the 3 upload runs a day use about 2 minutes each (about 180 minutes a month of your 2,000 free).

---

## 📚 New words

| Word | Meaning |
|---|---|
| **One-click connect** | Signing in to a platform from the dashboard and pressing *Allow*, instead of copying tokens by hand. |
| **OAuth** | The standard way to say "yes, this app may use my account" without giving it your password. |
| **App (developer app)** | Your own small, free registration at Google / Meta / TikTok. It gives you an id and a secret. |
| **Client ID / App ID / Client key** | The public name of your app. |
| **Client secret / App secret** | The password of your app. Keep it secret. |
| **Return address (redirect URI)** | The web address the platform sends you back to after you press *Allow*. |
| **Encrypt / lock** | To scramble data with a key, so only someone with the key can read it. |
| **Audit** | A check by the platform before your app may post public videos. |
| **Configuration ID** | A number that tells Facebook which permissions your app asks for. |
| **Practice mode (dry run)** | A test run that shows what would happen but posts nothing. |
| **Queue** | A waiting line: videos wait in order for their upload time. |
| **Slot** | One upload time (for example 7:00 AM). Each channel gets at most one video per slot. |
