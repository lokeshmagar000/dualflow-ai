/**
 * The list of things Remotion can draw:
 *   "Video"     the full video (size and length come from the props)
 *   "Thumbnail" one still picture for YouTube
 */
import { Composition, Still } from "remotion";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/800.css";
// Word Pop subtitles and the intro: Poppins for English, Mukta for Nepali (free Google Fonts).
import "@fontsource/poppins/800.css";
import "@fontsource/mukta/800.css";
// The logo font (Latin + Devanagari): channel name and tagline.
import "@fontsource/baloo-2/600.css";
import "@fontsource/baloo-2/800.css";
// Thumbnail headlines: Anton (English) and Khand (Nepali), tall bold fonts popular on YouTube thumbnails.
import "@fontsource/anton/400.css";
import "@fontsource/khand/700.css";
import { FPS, sizeFor, storyFrames, storyStartFrame, thumbnailSizeFor, type ThumbnailProps, type VideoProps } from "../types";
import { Video } from "./Video";
import { Thumbnail } from "./Thumbnail";
import { VideoV2 } from "./VideoV2";
import type { V2Props } from "../v2types";

/** Example data, only used when you preview in Remotion Studio (pnpm --filter @dualflow/video preview). */
const sample: VideoProps = {
  format: "SHORT",
  language: "ne",
  title: "सगरमाथाका तीन अचम्मका कुरा",
  audioFile: "",
  durationMs: 9000,
  brand: "Namaste Facts",
  // No brandTag here on purpose: Remotion fills missing props from these examples,
  // so a Nepali label here once showed up in English videos.
  accent: "#F5A623",
  ctaStartMs: 6000,
  intro: { text: "Namaste Facts", tag: "नेपाली", tagline: "सानो तथ्य, ठूलो अचम्म", durationMs: 2000, soundFile: null },
  scenes: [
    { startMs: 0, endMs: 3000, text: "नमस्ते साथीहरू!" },
    { startMs: 3000, endMs: 6000, text: "सगरमाथा संसारकै सबैभन्दा अग्लो हिमाल हो।" },
    { startMs: 6000, endMs: 9000, text: "लाइक र फलो गर्नुहोस्।" },
  ],
  cues: [
    { startMs: 200, endMs: 2800, text: "नमस्ते साथीहरू!" },
    { startMs: 3100, endMs: 5900, text: "सगरमाथा संसारकै सबैभन्दा अग्लो हिमाल हो।" },
    { startMs: 6100, endMs: 8800, text: "लाइक र फलो गर्नुहोस्।" },
  ],
};

const sampleV2: V2Props = {
  language: "en",
  audioFile: "",
  durationMs: 9000,
  shots: [{ startMs: 0, endMs: 9000 }],
  words: [],
  emphasis: [],
  hook: { lines: ["Only 1 flag", "breaks the rule"], highlight: 0 },
  topic: "Nepal's flag",
  cards: [],
  sfx: [],
  musicFile: null,
  musicVolume: 0.2,
  brand: "Namaste Facts",
  brandTag: "",
  // Remotion fills missing props from these defaults: keep them empty (only politics videos set them).
  source: "",
  series: "",
  follow: null,
};

export function Root() {
  return (
    <>
      <Composition
        id="Video"
        component={Video}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={storyStartFrame(sample) + storyFrames(sample)}
        defaultProps={sample}
        calculateMetadata={({ props }) => ({
          ...sizeFor(props.format),
          // The intro, then the voice and half a second of quiet (so the video does not cut off sharply).
          durationInFrames: storyStartFrame(props) + storyFrames(props),
        })}
      />
      {/* STYLE V2 sample (not used by the pipeline until the owner confirms the new style). */}
      <Composition
        id="VideoV2"
        component={VideoV2}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={300}
        defaultProps={sampleV2}
        calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(((props.durationMs + 300) / 1000) * FPS) })}
      />
      <Still
        id="Thumbnail"
        component={Thumbnail}
        width={1080}
        height={1920}
        defaultProps={
          { format: "SHORT", language: "ne", headline: "सगरमाथाका ३ रहस्य", brand: "Namaste Facts", accent: "#F5A623" } satisfies ThumbnailProps
        }
        calculateMetadata={({ props }) => thumbnailSizeFor(props.format, props.size)}
      />
    </>
  );
}
