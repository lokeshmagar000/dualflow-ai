# Put the DualFlow dashboard online (free, about 20 minutes)

The address `https://dualflow-web.onrender.com` in the other guides was only an **example**.
Nothing is online until you do the steps below once. After that you get your **own** address,
and `/privacy` and `/terms` work on it.

We use **Render** (render.com). Its free plan runs two small websites from this repo:

| Service | What it is | Example address |
| --- | --- | --- |
| `dualflow-web` | the dashboard you open in the browser | `https://dualflow-web.onrender.com` |
| `dualflow-api` | the "back office" the dashboard talks to | `https://dualflow-api.onrender.com` |

Free services **sleep** after 15 minutes with no visits. The first visit after that takes about one minute.
That is normal; just wait and refresh.

---

## Step 1. Collect 4 values first (write them in your notebook)

You saved these as GitHub Secrets before, but GitHub never shows a secret again, so copy them from the
original websites:

1. **DATABASE_URL** — neon.com → your project → **Connect** → turn **Connection pooling OFF** →
   copy the string that starts with `postgresql://`.
2. **R2_ACCOUNT_ID** — dash.cloudflare.com → **R2** → the **Account ID** on the right side.
3. **R2_ACCESS_KEY_ID** and **R2_SECRET_ACCESS_KEY** — R2 → **Manage API tokens** → **Create API token** →
   *Object Read & Write* for the bucket `dualflow` → copy both values (the secret is shown only once).

Also choose:

4. **ADMIN_EMAIL** — the email you will type to log in to the dashboard (any email of yours).
5. **ADMIN_PASSWORD** — a long password (12+ characters). Only you know it.

## Step 2. Create the services on Render

1. Go to **render.com** → **Get Started** → **Sign up with GitHub**. (No credit card is needed for free services.)
2. If Render asks, allow it to see the repo **dualflow-ai** (choose *Only select repositories* → `dualflow-ai`).
3. In the Render dashboard click **+ New** (top right) → **Blueprint**.
4. Pick **lokeshmagar000/dualflow-ai** → **Connect**. Branch: **main**.
5. **Blueprint Name**: `dualflow`. Render reads the file `render.yaml` and shows two services:
   `dualflow-api` and `dualflow-web`.
6. Render now asks for the values. Paste them:

   | Name | Service | What to paste |
   | --- | --- | --- |
   | `DATABASE_URL` | dualflow-api | from Step 1 |
   | `R2_ACCOUNT_ID` | dualflow-api | from Step 1 |
   | `R2_ACCESS_KEY_ID` | dualflow-api | from Step 1 |
   | `R2_SECRET_ACCESS_KEY` | dualflow-api | from Step 1 |
   | `GITHUB_REPO` | dualflow-api | `lokeshmagar000/dualflow-ai` |
   | `GITHUB_DISPATCH_TOKEN` | dualflow-api | leave empty for now (only for the **Run now** button) |
   | `API_URL` | dualflow-web | `https://dualflow-api.onrender.com` |
   | `ADMIN_EMAIL` | dualflow-web | your login email |
   | `ADMIN_PASSWORD` | dualflow-web | your password |

   You do **not** type `INTERNAL_API_KEY` or `SESSION_SECRET`; Render makes them for you.
7. Click **Deploy Blueprint** (or **Apply**). The first build takes about 5–10 minutes.
   Both services must show a green **Live** / **Deployed**.

## Step 3. Find your real addresses

1. Click **dualflow-web**. At the top, under the name, there is a link ending in `.onrender.com`.
   **That is your dashboard address.** Write it down.
2. Click **dualflow-api** and look at its link the same way.
   - If it is exactly `https://dualflow-api.onrender.com`, you are done.
   - If it is different (for example `https://dualflow-api-k3x9.onrender.com`, because someone else already
     has the plain name), open **dualflow-web → Environment** → edit `API_URL` → paste the real API address →
     **Save Changes**. Render restarts the dashboard by itself.

## Step 4. Test

Use **your** dashboard address from Step 3 (shown here as `<your-dashboard>`):

1. `https://<your-dashboard>/privacy` → you see **Privacy policy**. ✅
2. `https://<your-dashboard>/terms` → you see **Terms of service**. ✅
3. `https://<your-dashboard>/` → the login page → type your email and password → the dashboard opens. ✅

These two links (`/privacy` and `/terms`) are what Google, Meta and TikTok ask for in
[channel-and-token-guide.md](channel-and-token-guide.md). If your address is not `dualflow-web.onrender.com`,
use yours everywhere that guide shows `dualflow-web.onrender.com`.

## If something goes wrong

| What you see | What it means | Fix |
| --- | --- | --- |
| Page loads for a long time, then works | the free service was sleeping | normal, wait 1 minute |
| "Wrong email or password" | the values on Render do not match | dualflow-web → Environment → check `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Login works, but pages show an error | the dashboard cannot reach the API | check `API_URL` (Step 3) and that dualflow-api is **Live** |
| dualflow-api build fails at "prisma migrate" | wrong database string | copy `DATABASE_URL` again with pooling **OFF** |
| Address shows "Not Found" from Render | the service was never deployed or was deleted | do Step 2 again |

---

### 📚 New words

- **Deploy** — put your code on a server so anyone can open it on the internet.
- **Blueprint** — a file (`render.yaml`) that tells Render which services to create and how. One click builds everything.
- **Service** — one program running on Render, with its own address.
- **Environment variable** — a setting (like a password) given to the program from outside, not written in the code.
- **Sleep / cold start** — a free server turns off when nobody uses it and turns on again at the next visit.
- **Connection pooling** — a helper that shares database connections; our setup tool needs a direct one, so turn it off.
