# Fix "Could not reach the API" / error 429 (beginner guide)

## What was wrong

Your dashboard runs on **two** free Render servers:

- **dualflow-web** shows the pages,
- **dualflow-api** reads the database.

Every page went from dualflow-web **over the internet** to dualflow-api. Render protects its servers
with Cloudflare. Many Render apps share the same internet address, so Cloudflare sometimes thinks
the traffic is too much and answers **"Just a moment..." (error 429)** instead of your data.
That is the long red text you saw on every page.

The new dashboard already handles it better (it tries again by itself and shows a short, clear message
with a **Try again** button). But the **lasting fix** is to stop going over the internet at all:
**one server mode**. Then the API runs **inside** dualflow-web, so nothing can block it, and it is faster.

It takes about **5 minutes**. You only copy some values from one server to the other.

## Step 1: copy the keys to dualflow-web

1. Open [dashboard.render.com](https://dashboard.render.com) and click **dualflow-api**, then **Environment** in the left menu.
   Keep this tab open.
2. In a **second tab**, open **dualflow-web**, then **Environment**, then press **Edit**.
3. In dualflow-web, add each of these with **+ Add**. Copy each **value** from the dualflow-api tab
   (the eye icon shows a hidden value):

   | Key | Where the value comes from |
   | --- | --- |
   | `DATABASE_URL` | copy from dualflow-api (**this one turns on one server mode**) |
   | `R2_ACCOUNT_ID` | copy from dualflow-api |
   | `R2_ACCESS_KEY_ID` | copy from dualflow-api |
   | `R2_SECRET_ACCESS_KEY` | copy from dualflow-api |
   | `STORAGE` | type `r2` |
   | `R2_BUCKET` | type `dualflow` |
   | `GITHUB_REPO` and `GITHUB_DISPATCH_TOKEN` | copy from dualflow-api, **only if it has them** (they make **Generate now** and **Run now** work) |

   If a key is already there, check that its value is the same and leave it.
4. Press **Save, rebuild, and deploy**. Wait until it says **Live** (about 5 minutes).

## Step 2: check that it worked

1. Open your dashboard and sign in.
2. Open **Settings** in the menu (bottom left, or behind the ☰ button on a phone).
3. Under **Connection** you should see a green tick next to **One server mode: On** and **API answers: Yes**.

You can also look at **dualflow-web**, then **Logs**. You should see:
`One server mode: starting the API inside the dashboard server.`

## Step 3: put the old API server to sleep

Now dualflow-api is not needed any more.

1. Open **dualflow-api**, then **Settings**, scroll down, and press **Suspend Web Service**.
2. Use **Suspend**, not Delete, so you can switch back. (Do not delete it: dualflow-web still reads
   `INTERNAL_API_KEY` from it.)

This also keeps you inside Render's free 750 hours a month, because only one server is awake.

## Something broke?

Open **dualflow-web**, then **Environment**, delete `DATABASE_URL`, save, and **Resume** dualflow-api.
Everything works like before.

## Optional: keep it awake

Free servers fall asleep after 15 quiet minutes. To avoid the one-minute wait after a break,
follow **Step 2** in [faster-dashboard.md](faster-dashboard.md) (a free checker opens `/healthz` every 10 minutes).
