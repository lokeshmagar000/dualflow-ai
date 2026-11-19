# DualFlow AI

Bilingual (Nepali + English) AI video generation and social media automation.
One topic in, two videos out, each posted to its own channels.

## What is here (Phase 0: Foundations)

```
apps/web       Next.js dashboard (login, overview, ideas, content, ...)
apps/api       Fastify API: topics, stories, costs, kill switch
apps/worker    Worker: runs the pipeline steps from the job queue
packages/db    Prisma schema: Story -> Variant (ne, en) and all other tables
packages/shared  Shared types, job names and validation
packages/queue   Job queue stored in Postgres (no Redis)
packages/ai      Research + scripts (Gemini free, Claude, or practice)
packages/voice   Voice + subtitles (Edge free, Azure, or practice)
packages/storage Files on this computer or in Cloudflare R2
```

How a video moves through the system:

1. You add an idea in **Ideas & Chat** and click **Make NE + EN video**.
2. The API creates a **Story** with two **Variants** (Nepali and English) and queues a `research` job.
3. The worker runs `research`, then `script → voice → thumbnail → render` for **both languages in parallel**.
4. When both variants are ready, the Story is ready. (Phase 1 adds the real AI work.)

## Phase 1A: AI research and scripts

- `packages/ai` talks to Claude. **Budget mode** (default, `AI_MODEL=claude-haiku-5-5`) keeps costs to a few cents per video pair; **quality mode** (`AI_MODEL=claude-opus-5-5`) gives the best writing.
- **research** step: Claude searches the web, then returns checked facts with sources and one shared visual plan (list of scenes).
- **script** step: runs once per language, in parallel. Each script is written natively in that language from the same facts and scenes (Nepali rules: short sentences, everyday words, numbers written as words for the voice, Unicode NFC).
- Every Claude call writes a `CostEvent`. Before each paid step the worker checks the kill switch and the daily budget.
- Errors that retrying cannot fix (missing or wrong API key) stop at once; others retry 3 times. Failed stories show the reason and a **Try again** button.

Needs `ANTHROPIC_API_KEY` in your environment (or `DUALFLOW_ANTHROPIC_API_KEY` if your host hides `ANTHROPIC_*` names, like Claude Code cloud sessions do). Never commit it.

## Practice mode (no API key needed)

Set `AI_PROVIDER=mock` in `.env` (it is already on in `.env.example`; the older `AI_MODE=mock` also works). Research and scripts then use
clearly marked practice text, cost $0, and need no key. Everything after them (voice,
subtitles, dashboard) works exactly as with real AI, so you can test the whole app for free.
Change it to `gemini` (free) or `claude` when your key works.

## Phase 1B: voiceover and subtitles

- `packages/voice` turns each scene into speech, glues the scenes together with a short pause,
  and builds subtitles (`.srt` for YouTube/Facebook, `.vtt` for browsers) from the exact time of every word.
- `VOICE_PROVIDER=mock` (default): a free practice voice that beeps at each word.
- `VOICE_PROVIDER=azure`: real Azure neural voices (`ne-NP-HemkalaNeural` for Nepali). The free **F0** tier
  gives 500,000 characters a month (about 250 Nepali + English short pairs). Needs `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`.
- Subtitle lines break at the end of a sentence (`.` `!` `?` and the Nepali `।`) and stay short enough to read on a phone.
- `packages/storage` saves files in the `storage/` folder on your own computer (free). It can be switched to Cloudflare R2 later.
- The story page has an audio player with **live subtitles**, scene times, and download links.
- Run the tests with `pnpm test`.

## Run it on your computer

You need Node.js 22, pnpm and Docker.

```bash
pnpm install                 # install all packages
docker compose up -d         # start Postgres
cp .env.example .env         # then fill in the values (see comments in the file)
cp .env packages/db/.env     # Prisma reads the database URL from here
pnpm db:migrate              # create the database tables
pnpm db:seed                 # add a starter workspace and idea
pnpm dev                     # start web (port 3000), api (4000) and worker
```

Open http://localhost:3000 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## Free plan ($0 a month)

The free plan runs without any server that is on all day:

| Part | Free service | Setting |
| --- | --- | --- |
| Dashboard + API | Render free web services (`render.yaml`) | |
| Database + job queue | Neon free Postgres | `DATABASE_URL` |
| Making the videos | GitHub Actions (`.github/workflows/pipeline.yml`), every 3 hours or "Run now" | `WORKER_MODE=once` |
| Research + scripts | Gemini free tier | `AI_PROVIDER=gemini`, `GEMINI_API_KEY` |
| Voice | Edge TTS (no key) or Azure F0 | `VOICE_PROVIDER=edge` or `azure` |
| Files | Cloudflare R2 (10 GB free) | `STORAGE=r2`, `R2_*` |

Every part is a switch, so moving to a paid provider later is a settings change, not new code.
The worker stops by itself at the Gemini daily limit (`GEMINI_DAILY_REQUESTS`) and at 90% of Azure's free
characters, and continues when the limit resets. The **Costs & Automation** page shows how much of each
free limit is used, the waiting jobs, a **Run now** button and the kill switch.

### Free plan setup (one time)

1. **Neon** (neon.com): create a free project, copy the *direct* connection string.
2. **Google AI Studio** (aistudio.google.com): create a free Gemini API key. Check your daily limit there.
3. **Cloudflare R2**: create a bucket called `dualflow` and an R2 API token (Object Read & Write) for it.
4. **GitHub** (this repo → Settings → Secrets and variables → Actions):
   - Secrets: `DATABASE_URL`, `GEMINI_API_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
     (and later `AZURE_SPEECH_KEY` or `ANTHROPIC_API_KEY`)
   - Variables (optional): `AI_PROVIDER` (default `gemini`), `VOICE_PROVIDER` (default `edge`),
     `GEMINI_DAILY_REQUESTS` (default `20`), `R2_BUCKET` (default `dualflow`), `EDGE_VOICE_NE`
5. **Render** (render.com → New → Blueprint → this repo). Fill in the values it asks for. For **Run now**, make a
   fine-grained GitHub token for only this repo with *Actions: Read and write* and set it as `GITHUB_DISPATCH_TOKEN`
   (and `GITHUB_REPO=lokeshmagar000/dualflow-ai`) on `dualflow-api`.
6. Open the dashboard, add an idea, and press **Run now** (or wait for the next 3-hour run).

To hear the free voices first, run **Actions → Voice sample → Run workflow** and download the MP3 files.

**Edge TTS on your own computer** needs Python 3 and FFmpeg:
`pip install -r packages/voice/python/requirements.txt`.

## Mac app (make videos with one button)

`desktop/` is a small Mac app: type an idea, press **Make video now**, watch the run,
and download the finished Nepali + English videos. It only talks to GitHub with a token
that can run Actions in this repo. Download, first-open and token steps: [desktop/README.md](desktop/README.md).

## Security notes

- The dashboard uses a signed, HTTP-only session cookie.
- The API only accepts requests with the secret `INTERNAL_API_KEY`.
- Never commit `.env`. Keys for the free plan live in GitHub Secrets and Render settings, never in code.
- The Gemini key is sent in a request header, never in the URL, so it does not appear in logs.
- Social media tokens will be stored encrypted (Phase 2).
