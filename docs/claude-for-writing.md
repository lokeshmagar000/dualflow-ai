# Use Claude for writing (topics, research, scripts, picture checks)

The dashboard's **Settings** page has a card called **AI for writing** with two choices:

| Choice | Cost | Daily limit | Notes |
|---|---|---|---|
| **Claude (Anthropic)** | Paid from your Claude Console credit | None | Best writing. If Claude fails (no credit left, busy), **Gemini does that step instead**, so night videos are still made. |
| **Gemini (Google, free)** | Free | About 20 writing requests a day | When they run out, videos wait until the next day. |

When Claude is chosen you also pick the model:

- **Claude Haiku 5.5 (cheapest)**: about $0.05-0.10 a night (2 stories = 4 videos), most of it web searches. $5 lasts about 2 months.
- **Claude Sonnet 5.5 (better writing)**: about $0.40-0.70 a night. $5 lasts about 1 week.

The **voices do not change**: they stay Gemini voices, with Edge as the backup.
Trending hashtags still use free Gemini + Google Search when a Gemini key exists.

## Where does the Claude key go?

**Only in GitHub.** The videos are made by GitHub Actions (the "Pipeline" workflow), and that is the only
place that talks to Claude. The dashboard (Vercel or Render) only saves your choice in the database, it never
calls Claude itself, so you do **not** need to add the key on Vercel or Render.

## Steps (about 5 minutes)

### 1. Make the key in the Claude Console
1. Open <https://platform.claude.com> and sign in (the account where you added the $5).
2. Left menu: **API keys** → **Create key**.
3. Name: `dualflow-github`. Press **Create**.
4. **Copy the key now** (it starts with `sk-ant-`). It is shown only once.
5. Good idea: **Settings → Limits** (or **Billing**) → set a monthly spend limit, for example $5, so it can never cost more.

### 2. Put the key in GitHub
1. Open <https://github.com/lokeshmagar000/dualflow-ai/settings/secrets/actions>.
2. Press **New repository secret**.
3. Name: `ANTHROPIC_API_KEY` (exactly like this).
4. Secret: paste the key. Press **Add secret**.

### 3. Choose Claude on the dashboard
1. Open your dashboard → **Settings** → card **AI for writing**.
2. Pick **Claude (Anthropic)** and **Claude Haiku 5.5 (cheapest)**. Press **Save**.
3. You see "Saved. The next video run uses it."

(Your dashboard needs the new version first: Vercel deploys it by itself after the change is merged.
If the card is not there, open Vercel → your project → **Deployments** → **Redeploy**.)

### 4. Check that the key works (optional, 1 minute)
GitHub → **Actions** → **Check keys** → **Run workflow**. In the log you want:

```
PASS     Claude (ANTHROPIC_API_KEY)  -- claude-haiku-5-5 answered
```

`FAIL ... credit balance too low` means the $5 is not on this account (or ran out).
`FAIL ... key is wrong` means copy the key again (step 1) and update the secret (step 2).

## How to see what Claude costs
- Dashboard **Settings → AI for writing** shows Claude spending today and this month.
- **Costs & limits** shows every step's cost.
- The Claude Console (**Usage**) shows the real bill.

## Advanced (GitHub Variables, optional)
- `AI_PROVIDER` (`claude` / `gemini`): used only until you press Save on the dashboard.
- `AI_MODEL`: same, for the Claude model.
- `AI_BACKUP=off`: no Gemini backup (a Claude problem makes the step wait and retry instead).
