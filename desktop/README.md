# DualFlow Mac app

A small app for your Mac. Press **Make video now** and the video maker runs on
GitHub (free). You do not need to ask Claude, so you do not use Claude tokens.

What it does:

| Page | What you can do |
| --- | --- |
| 🎬 Make a video | Type your own idea (or leave it empty for an AI topic) and press the button. Shows what is running now. |
| ⏱ Runs | Every run (automatic every 3 hours, or yours). Get the finished videos with one click. |
| 📁 My videos | Play the downloaded Nepali + English videos, or show them in Finder (`~/Movies/DualFlow`). |
| 💸 Free limits | GitHub minutes used this month, runs today, and the free plans you use. |
| ⚙️ Settings | Your GitHub token (locked in the Mac Keychain), repo, branch, web dashboard address. |

Everything stays **$0**: the app only talks to GitHub, and GitHub runs the
same free "Pipeline" workflow as before.

## 1. Download the app

1. Open the repo on GitHub → **Releases** → **DualFlow Mac app**.
   (Before the pull request is merged: **Actions** → **Mac app** → the newest
   green run → **Artifacts** → **DualFlow-mac**. It downloads a zip; double-click it.)
2. Pick the right file:
   - **`DualFlow-…-arm64.dmg`** for Macs with an Apple chip (M1, M2, M3, M4).
   - **`DualFlow-…-x64.dmg`** for older Intel Macs.
   - Not sure? Apple menu  → **About This Mac** → look at "Chip".
3. Double-click the `.dmg` and drag **DualFlow** into **Applications**.

## 2. Open it the first time

The app is free and not "notarized" by Apple (that costs $99/year), so macOS
asks once:

1. Open **Applications**, **right-click** (or Control-click) **DualFlow** → **Open** → **Open**.
2. If macOS only shows "Done" / "Move to Bin": open **System Settings** →
   **Privacy & Security**, scroll down, press **Open Anyway** next to
   "DualFlow", then enter your Mac password.

After this first time it opens normally.

## 3. Make your GitHub token (2 minutes)

The token is like a key that lets the app press "Run workflow" for you. It can
do **only** that, and **only** for this repo.

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. **Token name:** `DualFlow Mac app`. **Expiration:** 90 days.
3. **Repository access:** *Only select repositories* → `dualflow-ai`.
4. **Permissions** → **Repository permissions** → **Actions** → **Read and write**.
   Leave everything else as "No access".
5. Press **Generate token** and copy it (it starts with `github_pat_`).
6. In the app: **Settings** → paste it → **Save token**. You should see
   "Token saved and working".

Never paste the token in a chat, an email or the code. The app keeps it
encrypted with a key from your Mac's Keychain. When it expires, make a new one
and save it again.

## How it works (for learning)

```
desktop/
  main.js        "main" part: Keychain, files, talks to GitHub (has the token)
  github.js      the GitHub API calls (start a run, list runs, download videos)
  preload.js     the safe bridge: the only functions the window may call
  renderer/      the window you see: index.html, styles.css, app.js
  build/after-pack.js   free "ad-hoc" signature so Apple-chip Macs can open it
```

- **Make video now** → `POST /repos/…/actions/workflows/pipeline.yml/dispatches`
  with your idea as the `topic` input. The Pipeline workflow adds a story with
  that title, then makes the Nepali and English videos.
- **Runs** → reads the run list every 15 seconds while something runs (every
  60 seconds otherwise).
- **Get videos** → downloads the run's `videos` zip (GitHub keeps it 7 days)
  into `~/Movies/DualFlow/run-<number>/`.

Run it from the code (needs Node.js 22):

```bash
cd desktop
npm install
npm start
```

The `.dmg` is built by `.github/workflows/desktop-app.yml` on a free GitHub Mac machine.
