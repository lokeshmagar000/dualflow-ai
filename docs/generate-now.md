# Make the "Generate now" button work (Vercel)

The **Generate now** button (Ideas & auto mode page) asks GitHub to start one extra video run.
To do that, the dashboard needs a **GitHub key** (a token). You make it once, in about 5 minutes.

Auto mode is not changed by this. Night videos still come at 1:05 AM and 1:35 AM.
Generate now just adds **one more** video when you want it. The AI picks a new topic and never repeats a recent one.

## Step 1: Make the GitHub key

1. Open https://github.com/settings/personal-access-tokens/new (you must be signed in to GitHub).
2. **Token name**: `dualflow generate now`
3. **Expiration**: pick **1 year** (or "No expiration").
4. **Repository access**: choose **Only select repositories**, then pick **dualflow-ai**.
5. **Permissions** → **Repository permissions** → **Actions** → choose **Read and write**.
   (GitHub also adds "Metadata: Read" by itself. That is fine.)
6. Press **Generate token** at the bottom.
7. **Copy** the token (it starts with `github_pat_`). GitHub shows it only once.

Keep it secret. Never paste it in a chat, a file, or a screenshot.

## Step 2: Paste it on Vercel

1. Open https://vercel.com, then your **dualflow-ai** project.
2. **Settings** → **Environment Variables**.
3. Add:
   - **Key**: `GITHUB_DISPATCH_TOKEN`
   - **Value**: the token you copied
   - Environments: tick **Production** (and Preview if you like)
4. Press **Save**.

You do **not** need `GITHUB_REPO` on Vercel any more: the dashboard finds the repo by itself.
(If you already have `GITHUB_REPO`, keep it. It must be `lokeshmagar000/dualflow-ai`.)

## Step 3: Redeploy

1. In Vercel go to **Deployments**.
2. On the newest one press the **⋯** menu, then **Redeploy**, then **Redeploy** again.
3. Wait about 2 minutes until it says **Ready**.

## Step 4: Test

Open the dashboard → **Ideas & auto mode**. The button now says **Generate now** (blue, no "on GitHub").
**Settings** also shows "Generate now and Run now: Ready".

Press it only when you really want a new video, because each press makes one new story.

## If it does not work

- Message says `GitHub said 401` or `403`: the token is wrong or expired, or it does not have
  **Actions: Read and write**. Make a new one (Step 1) and paste it again (Step 2, 3).
- Message says `GitHub said 404`: the token was made for another repository. Pick **dualflow-ai** in Step 1.

## Until then

The button still works without the key: it says **Generate now (on GitHub)** and opens the Pipeline page.
There press **Run workflow**, tick **Make one automatic video now**, and press the green **Run workflow**.
