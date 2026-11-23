# Move the dashboard to Vercel (fast, never sleeps, free)

## Why move

| | Render free (now) | Vercel Hobby (free) |
| --- | --- | --- |
| Falls asleep? | Yes, after 15 minutes. Waking up takes about **1 minute**. | **No.** After a quiet time the first click takes about **1 second** extra. |
| Speed when awake | Slow: a very small computer (0.1 of a processor, 512 MB memory). | Fast: strong computers, pages close to you. |
| Keep-awake checker needed? | Yes (UptimeRobot) | No |
| Cost | $0 | $0 |

Nothing else changes: your videos are still made by GitHub at 2 AM and 4 AM, still stored in Cloudflare R2,
and the database is still Neon. Only the **dashboard** (the website you click in) moves.

## Honest limits of the free Vercel plan

- **Personal use only.** Vercel's free "Hobby" plan is for personal, non-commercial projects. A private dashboard
  that only you use is fine to start. When your channels earn real money, move to Vercel **Pro** ($20 a month).
  That fits our plan: free now, upgrade when the project earns.
- **One click can run for at most about 5 minutes.** Normal pages take less than 1 second, so this only matters for
  **Download all** with very many videos. If it stops, download fewer at a time (one page of the Ready list).
- **First click after a quiet time** takes about 1 second more (Vercel wakes a "function"). Not a minute like Render.
- Big videos never go through Vercel (they come straight from R2), so the free traffic (100 GB a month) is plenty.

## What you need (5 minutes of copying)

Open [dashboard.render.com](https://dashboard.render.com) → **dualflow-web** → **Environment** in a tab.
You will copy these values from there (the eye icon shows a hidden value):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | copy from Render |
| `R2_ACCOUNT_ID` | copy from Render |
| `R2_ACCESS_KEY_ID` | copy from Render |
| `R2_SECRET_ACCESS_KEY` | copy from Render (**must be exactly the same**: your channel tokens are locked with it) |
| `TOKEN_KEY` | copy from Render **only if it is there** (same reason) |
| `R2_BUCKET` | `dualflow` (or what Render has) |
| `STORAGE` | `r2` |
| `GITHUB_REPO` | copy from Render (makes **Generate now** and **Upload** buttons work) |
| `GITHUB_DISPATCH_TOKEN` | copy from Render |
| `ADMIN_EMAIL` | copy from Render (your login email) |
| `ADMIN_PASSWORD` | copy from Render (your login password) |
| `SESSION_SECRET` | copy from Render (or any long random text) |
| `INTERNAL_API_KEY` | copy from Render (or any long random text) |
| `GEMINI_DAILY_REQUESTS` | `20` |
| `NEXT_PUBLIC_OWNER_NAME` | `Namaste Facts` |

## Step 1: make a Vercel account (2 minutes)

1. Go to [vercel.com/signup](https://vercel.com/signup).
2. Choose **Hobby** (free), type your name, then **Continue with GitHub** and allow it.

## Step 2: add the project (5 minutes)

1. On Vercel press **Add New…** → **Project**.
2. Find **dualflow-ai** in the list and press **Import**.
   (Not in the list? Press **Adjust GitHub App Permissions** → choose **dualflow-ai** → **Save**.)
3. **Root Directory**: press **Edit** → choose **apps/web** → **Continue**.
   This is the most important step. **Framework Preset** then shows **Next.js**.
4. Leave **Build and Output Settings** as they are (the repo already tells Vercel what to do).
5. Open **Environment Variables**. Add every name and value from the table above
   (type the name in **Key**, paste the value in **Value**, press **Add**).
   Tip: you can paste many lines like `NAME=value` into the first Key box at once.
6. Press **Deploy**. Wait 3 to 5 minutes until you see **Congratulations!**

Your new address looks like `https://dualflow-ai-xxxx.vercel.app`. Vercel shows it under **Domains**.

## Step 3: put the dashboard near your database (2 minutes)

Pages are fastest when Vercel runs next to your Neon database.

1. In [console.neon.tech](https://console.neon.tech) open your project. The **region** is shown on the project
   page, for example *AWS US East 1 (N. Virginia)* or *AWS Asia Pacific 1 (Singapore)*.
2. In Vercel open your project → **Settings** → **Functions** → **Function Region**. Pick the same place:
   - US East (N. Virginia) → **Washington, D.C., USA (iad1)** (this is Vercel's normal choice)
   - US East 2 (Ohio) → **Cleveland, USA (cle1)**
   - US West 2 (Oregon) → **Portland, USA (pdx1)**
   - Europe Central 1 (Frankfurt) → **Frankfurt, Germany (fra1)**
   - Asia Pacific 1 (Singapore) → **Singapore (sin1)**
   - Asia Pacific 2 (Sydney) → **Sydney, Australia (syd1)**
3. Press **Save**. Then **Deployments** → the top one → **⋯** → **Redeploy**.

## Step 4: check it works (2 minutes)

1. Open your new address and log in with your usual email and password.
2. Open **Settings**. You should see green ticks:
   - **One server mode**: On
   - **Built-in API**: running. Database update: done when Vercel built the dashboard.
   - **Video storage**: connected
3. Open **Ready to upload** and press a **Download** button. The video should start downloading.

## Step 5: tell Google, Meta and TikTok the new address (5 minutes)

Your Connect buttons send you back to the dashboard's address, so the platforms must know the new one.

1. In the new dashboard open **Channels**. Each platform shows its **return address**,
   for example `https://dualflow-ai-xxxx.vercel.app/connect/youtube/callback`. Copy it.
2. **Add** it next to the old Render one (do not remove the old one yet):
   - Google: [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
     → your OAuth client → **Authorized redirect URIs** → **+ Add URI** → **Save**.
   - Meta: [developers.facebook.com/apps](https://developers.facebook.com/apps) → your app → **Facebook Login**
     → **Settings** → **Valid OAuth Redirect URIs** → add → **Save changes**.
   - TikTok: [developers.tiktok.com](https://developers.tiktok.com) → your app → **Login Kit** → **Redirect URI** → add → save.
3. Privacy and terms pages: if an app asks for them, the new ones are `<new address>/privacy` and `<new address>/terms`.

Channels you already connected **keep working**. You only need the new address when you press **Connect** again.

## Step 6: keep Render as a backup, then rest it

- Use the Vercel address for a few days. Render still works the same, so you can go back any time.
- When you are happy: Render → **dualflow-web** → **Settings** → **Suspend Web Service** (suspend, not delete).
  In UptimeRobot you can pause the Render monitor; Vercel does not need it.
- Want Render back? Press **Resume** on Render. Nothing else to change.

## Something went wrong?

| What you see | What to do |
| --- | --- |
| Build failed, "No Next.js version detected" | Step 2.3 was missed: **Settings** → **Build and Deployment** → **Root Directory** = `apps/web` → Save → Redeploy. |
| Build failed with `DATABASE_URL` or `P1001` | The `DATABASE_URL` value is wrong or missing. Copy it again from Render, then Redeploy. |
| Login says wrong password | `ADMIN_EMAIL` / `ADMIN_PASSWORD` were not copied exactly. Fix in **Settings** → **Environment Variables**, then Redeploy. |
| Settings says "Video storage: not connected" | One of the `R2_...` values is missing. Add it and Redeploy. |
| Channels show a red note about tokens or "key" | `R2_SECRET_ACCESS_KEY` (or `TOKEN_KEY`) is not exactly the same as on Render. |
| Anything else | Vercel → your project → **Logs**. Send a screenshot of the red lines. |

After you change an environment variable on Vercel, always **Redeploy** (Deployments → top one → ⋯ → Redeploy).
New code from GitHub (`main`) goes online on Vercel by itself, like on Render.
