# Make the dashboard faster (beginner guide)

## Why it was slow

| Cause | What we did |
| --- | --- |
| **Free Render servers fall asleep** after 15 minutes without visits. Waking up takes about a minute. We had **two** servers (dashboard + API), so after a break you could wait for one, then the other. | **One server mode** (step 1 below) and a **keep-awake check** (step 2). |
| Every page went from the dashboard server **over the internet** to the API server and back. | In one server mode the API runs on the same machine, so this trip is almost instant. |
| The **Ready to upload** page loaded up to 60 stories at once, and every preview picture went browser → dashboard → API → R2. | Now 10 stories per page (with **Older →** buttons), and preview pictures come **straight from R2**. |
| Each page asked the database for the workspace again. | The API now remembers it. |
| After a click, the screen **froze** until everything was ready, so it felt broken. | The menu item you click now shows a small spinner **instantly** until the page arrives. |

The code changes work by themselves after merging. Steps 1 and 2 are a few clicks for you.

## Step 1: one server mode (about 5 minutes)

The API now starts **inside the dashboard server** when that server has the database key.

1. Open [dashboard.render.com](https://dashboard.render.com) → click **dualflow-api** → **Environment** in the left menu.
2. Keep that tab open. In a second tab open **dualflow-web** → **Environment** → **Edit**.
3. Add these to **dualflow-web** (press **+ Add**), copying each **value** from dualflow-api
   (the eye icon shows a hidden value):
   - `DATABASE_URL`
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` (only if dualflow-api has them; they make "Run now" work)
   - `STORAGE` = `r2` and `R2_BUCKET` = `dualflow` (if they are not there yet)
4. Press **Save, rebuild, and deploy**. Wait until it says **Live** (about 5 minutes).
5. Open your dashboard and click around. If pages show, it works.
   In **dualflow-web → Logs** you should see: `One server mode: starting the API inside the dashboard server.`
6. Now the old API server is not needed: **dualflow-api** → **Settings** → scroll down → **Suspend Web Service**.
   (Suspend, not delete, so you can switch back.)

**Something broke?** Delete `DATABASE_URL` from dualflow-web, save, and **Resume** dualflow-api.
Everything works like before.

## Step 2: keep it awake with a free checker (about 3 minutes)

A free website opens your dashboard's `/healthz` address every 10 minutes, so the server never falls asleep.
`/healthz` only says "ok"; it shows no private data.

1. Go to [uptimerobot.com](https://uptimerobot.com) and make a free account.
2. **+ New monitor** → type **HTTP(s)**.
3. **URL**: your dashboard address + `/healthz`, for example `https://dualflow-web.onrender.com/healthz`
   (use the address Render shows at the top of **dualflow-web**).
4. **Monitoring interval**: **10 minutes** (any time under 15 works). Press **Create monitor**.

Important: do step 1 first (and suspend dualflow-api). Render gives **750 free server hours a month**.
One server awake all month uses about 744 hours, which fits. Two servers awake all month (1,488 hours) would
**not** fit, and Render would stop them near the end of the month.

## What stays slow on the free plan (honest list)

- **Without step 2**, the first visit after 15 quiet minutes still takes about a minute. That is how
  Render's free plan saves money. Step 2 avoids it.
- **The free server is small** (0.1 CPU, 512 MB memory). Pages take about half a second to a second each,
  not instant like a paid server.
- **Neon (the free database) also naps** after 5 minutes without use. The first page after that waits
  about one more second.
- **Download all** sends the videos through the free server. It starts within seconds, but a big zip
  (for example 20 videos, about 300 MB) can take a few minutes to finish. Single **Download** buttons are faster because they come straight from R2.

When the channels earn money, Render's **Starter** plan (about $7 a month for one server) never sleeps
and is faster. Nothing in the code needs to change for that.
