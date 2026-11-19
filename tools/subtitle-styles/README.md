# Subtitle style previews

Pictures and 3 second clips of 5 subtitle styles, in **English** and **Nepali**,
so you can choose one before we change the real videos.

| # | Style | English font | Nepali font | Animation |
|---|-------|--------------|-------------|-----------|
| 1 | Word Pop | Poppins ExtraBold | Mukta ExtraBold | spoken word turns yellow and pops bigger |
| 2 | Karaoke Highlight | Baloo 2 Bold | Baloo 2 Bold | words fill with colour as they are spoken |
| 3 | Neon Glow | Poppins SemiBold | Hind SemiBold | words glow and fade in |
| 4 | Boxed Caption | Noto Sans Devanagari Bold | same | rounded red box slides up |
| 5 | Typewriter Story | Kalam Bold | Kalam Bold | letters type in, blinking cursor |

All fonts are free Google Fonts. The pictures are drawn by **Remotion + Chrome**,
the same way `packages/video` draws the real videos, so what you see is what you get
(Chrome joins Nepali letters like क्षेत्र correctly).

This folder is separate from the app. It does not change the live videos.

## Make them

- On GitHub: Actions → "Subtitle style previews" → Run workflow. It uses the
  `PIXABAY_API_KEY` secret for a real background clip. Results: `previews/`
  and the run's download.
- On your computer: `npm install` then `npm run render` (results in `out/`).

## Files

- `src/styles.tsx`: the 5 styles (one React component each)
- `src/Root.tsx`: the 1080 x 1920 video, background, sample sentence
- `src/render.ts`: makes the pictures, clips, GIFs and the side-by-side sheets
