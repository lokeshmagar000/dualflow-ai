/**
 * One preview: a real video clip in the background, one subtitle style on top.
 * Size and speed are the same as our real Shorts: 1080 x 1920, 30 frames a second.
 */
import { useEffect, useState } from "react";
import { AbsoluteFill, Composition, OffthreadVideo, continueRender, delayRender, staticFile } from "remotion";
// Free Google Fonts (from the "fontsource" packages), Nepali + English letters.
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/800.css";
import "@fontsource/mukta/800.css";
import "@fontsource/baloo-2/700.css";
import "@fontsource/hind/600.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "@fontsource/kalam/700.css";
import { COMPONENTS, STYLES, type Lang, type StyleId, type Word } from "./styles";

export const FPS = 30;
export const SECONDS = 3;

/** The sample sentence. "क्षेत्र", "पर्यटन" and "बढ्दैछ" test Nepali joined letters. */
export const SAMPLES: Record<Lang, string> = {
  en: "Nepal's tourism sector is growing fast this year",
  ne: "नेपालको पर्यटन क्षेत्र यस वर्ष छिटो बढ्दैछ",
};

/** Pretend timings: words spread evenly from 0.3 s to 2.8 s (real videos use the voice's timings). */
export function timedWords(text: string): Word[] {
  const parts = text.split(" ");
  const start = 300;
  const each = (2800 - start) / parts.length;
  return parts.map((t, i) => ({ text: t, startMs: start + i * each, endMs: start + (i + 1) * each }));
}

export type PreviewProps = { style: StyleId; lang: Lang; background: boolean };

const FONT_CHECKS = [
  '600 80px "Poppins"',
  '800 80px "Poppins"',
  '800 80px "Mukta"',
  '700 80px "Baloo 2"',
  '600 80px "Hind"',
  '700 80px "Noto Sans Devanagari"',
  '700 80px "Kalam"',
];

/** Wait until every font has loaded, so no frame is drawn with the wrong letters. */
function useFonts() {
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    Promise.all(FONT_CHECKS.flatMap((f) => [document.fonts.load(f, "Hello"), document.fonts.load(f, "क्षेत्र")]))
      .catch(() => undefined)
      .then(() => continueRender(handle));
  }, [handle]);
}

function Preview({ style, lang, background }: PreviewProps) {
  useFonts();
  const Style = COMPONENTS[style];
  const name = STYLES.find((s) => s.id === style)!.name;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #1d2b64, #3a6073 55%, #16222a)" }}>
      {background ? (
        <OffthreadVideo src={staticFile("bg.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      {/* Same dark shading as the real videos, so white text is easy to read. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)",
        }}
      />
      {/* Small label at the top, so you know which style you are looking at. */}
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 60,
          padding: "10px 26px",
          borderRadius: 40,
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontFamily: "Poppins",
          fontWeight: 600,
          fontSize: 38,
        }}
      >
        {style[0]}. {name} · {lang === "ne" ? "नेपाली" : "English"}
      </div>
      <Style words={timedWords(SAMPLES[lang])} lang={lang} scale={1} />
    </AbsoluteFill>
  );
}

export function Root() {
  return (
    <Composition
      id="Preview"
      component={Preview}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * SECONDS}
      defaultProps={{ style: "1-word-pop", lang: "ne", background: false } as PreviewProps}
    />
  );
}
