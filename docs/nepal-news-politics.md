# Nepal News & Politics videos

Fact videos about **what is trending in Nepal right now** (politics or any big event), plus
history, prime ministers, the constitution and numbers. Turn it on in the dashboard:
**Ideas & auto mode → Nepal News & Politics**.

## The rules (built into the code)

| Rule | How it is done |
| --- | --- |
| Never invent news | "News Explained" reads real headlines from **Google News** (free, no key) for the last 5 days. The AI may only choose one of those headlines by its number. |
| Trending first | A story that many different papers write about is ranked first (`rankTrending` in `packages/ai/src/news.ts`). |
| Every fact has a source | The research step searches the web. A politics video needs **at least 3 sources**, or it is stopped. Facts without a source are removed. |
| Sources on screen | A small line under the topic: `Source: Election Commission Nepal · The Kathmandu Post` (Nepali: `स्रोत: …`), plus the series label (e.g. **PM Files**). |
| Strictly neutral | Extra rules in every prompt (no good/bad words, same tone for every party, attribute claims). After writing, a word check looks for judgement words ("corrupt", "hero", "असफल", "गद्दार" …). If it finds one, the AI writes it again; twice = stopped. |
| Your approval | These videos are **never uploaded by themselves**, even when Auto upload is "Fully automatic". On **Ready to upload** they show a yellow "Check before you post" box with all the sources. |

## The news look (round 2)

- **Story shape**: a curious, neutral "why / what?" question as the hook, then 3 parts
  (what happened → why it matters → what happens next), or "3 things you didn't know" for the
  other series. The last line asks viewers one neutral question for the comments. No "Part 2" pill.
- **News graphics** drawn by code (stock sites have no politicians or meetings):
  red news bar with the date, the real headline as a newspaper clipping, quotes (only quotes that
  the research really found), a timeline, a trip map (city → city with flags), waving flags,
  and photos of public people (credit shown on the photo). `NEWS_PHOTOS=off` turns photos off.
- **Real photo when a name is said**: the script lists every person the narration names. Their photo
  pops up on the exact word where the voice says the name (about 3 seconds). The photo is the main
  picture of the person's Wikipedia article (free licence only); if that has no free photo, a
  Wikimedia Commons search is tried (the file name must have the first and last name).
  Real video clips of leaders are not used: TV news footage is owned by the channels and would
  get copyright (Content ID) claims. The photo slowly zooms instead.
- **Calm news-reader voice** (`GEMINI_TTS_STYLE_NEWS` changes it), a news sting on the first frame and
  a serious ticking news music bed. All sounds are made by code: no licence, no Content ID claims.

## The series

| Series | नेपाली | What it makes |
| --- | --- | --- |
| News Explained | समाचार बुझौँ | Today's most trending Nepal news: what happened, background, facts |
| Today in History | आजको इतिहास | A political event that happened on today's date |
| PM Files | PM फाइल | One prime minister per video, facts only, rotating parties |
| Constitution in 60s | संविधान ६० सेकेन्डमा | One article or right of the 2015 Constitution |
| Politics in Numbers | नम्बरमा राजनीति | Seats, voters, provinces… from official data |
| Politics Quiz | राजनीति क्विज | A question in the hook, the answer at the end |

The ticked series take turns (the one used longest ago goes next). If there is no fresh news,
the next series is used instead.

## Dashboard controls

- **Switch**: on = the night's automatic videos include news / politics.
- **News / politics videos each night**: `1 of the 2` (the 1:35 AM video), `Both`, or `None`.
- **Make one now**: pick a series and press it. Works even when the switch is off.
  (Without the GitHub key on the dashboard host: GitHub → Actions → Pipeline → Run workflow → type a
  series id such as `news-explained` in "Nepal News & Politics video now".)

## Optional GitHub settings (Variables)

- `POLITICS_NEWS_DAYS` (default `5`): how old a headline may be.
- `POLITICS_NEWS_QUERIES`: your own searches, separated by `|`, e.g. `Nepal|Nepal parliament|Nepal cricket`.

Cost: the same as a normal video (about 6 free Gemini requests). Google News is free.
