# Video style (V2)

Since this change, every new Short is made in **Style V2** (see the style guide in the project):

- **Hook on frame 1.** No logo intro. Big hook text slams in with a "hit" sound, then becomes a topic chip at the top.
- **Loop ending.** No "like and follow" card at the end. A small "Follow for Part 2" pill shows in the middle instead, and the last line leads back into the first.
- **Sound.** Quiet music made by our own code (no copyright claims), which gets quieter while the voice talks, plus whoosh, pop, hit, ding and riser effects. Final loudness is -14 LUFS.
- **Text and cards.** Key words become marigold stickers with a camera "punch". Up to 3 cards per video: numbers count up, years roll like a car's distance meter, dates flip like a desk calendar, times turn the hands of a clock. Stickers, cards, the topic chip and the follow pill keep moving a little, so nothing on screen is frozen.
- **Variety.** A picture never stays more than about 3 seconds. Longer lines are cut into ~2 s pieces, and the extra pieces show other on-topic pictures from the research "b-roll" list (people, places, maps, culture of the same subject).
- **Always moving.** Photos slowly zoom and drift. Short video clips loop instead of stopping on their last frame.
- **Pace.** 30-45 second scripts, 120 ms between lines, a livelier voice style.
- **Picture check.** Gemini looks at every stock clip before we use it, and rejects clips that do not show what the narrator is talking about (for example another country's flag in a video about Nepal's flag). A wrong picture is never used. It also rejects "cut-out" pictures: one object on a plain white, black, green-screen or single-colour background, 3D renders, clip-art and text slides.

## Settings (all optional)

| Setting | Default | What it does |
| --- | --- | --- |
| `VIDEO_STYLE` | `v2` | `classic` = the older style (logo intro, title box, like & follow card) |
| `STOCK_VISION_CHECK` | `on` | `off` = no picture check (only stock tags are used) |
| `GEMINI_VISION_MODEL` | `gemini-flash-latest` | Model for the picture check (Flash-Lite is the backup) |
| `MUSIC_VOLUME` | `0.28` | Music loudness when nobody talks (0 to 1) |
| `SCENE_GAP_MS` | `120` (V2), `400` (classic) | Silence between two lines |
| `GEMINI_TTS_STYLE` | energetic storyteller (V2) | How the Gemini voice speaks |

The picture check uses free Gemini requests (about one per picture). They are shown as `gemini-vision` on the Costs page and do not count against the script limit.

## See it

Run the **Style sample** workflow on the branch: it renders the same story in the old and the new style (English and Nepali) into `samples/style-v2/`.
