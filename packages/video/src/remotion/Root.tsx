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
import { FPS, sizeFor, storyFrames, storyStartFrame, thumbnailSizeFor, type ThumbnailProps, type VideoProps } from "../types";
import { Video } from "./Video";
import { Thumbnail } from "./Thumbnail";

/** Example data, only used when you preview in Remotion Studio (pnpm --filter @dualflow/video preview). */
const sample: VideoProps = {
  format: "SHORT",
  language: "ne",
  title: "सगरमाथाका तीन अचम्मका कुरा",
  audioFile: "",
  durationMs: 9000,
  brand: "DualFlow",
  accent: "#FFC83D",
  intro: { text: "DualFlow नेपाली", tagline: "हरेक दिन नयाँ कुरा", durationMs: 2000, soundFile: null },
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
      <Still
        id="Thumbnail"
        component={Thumbnail}
        width={1080}
        height={1920}
        defaultProps={
          { format: "SHORT", language: "ne", headline: "सगरमाथाका ३ रहस्य", brand: "DualFlow", accent: "#FFC83D" } satisfies ThumbnailProps
        }
        calculateMetadata={({ props }) => thumbnailSizeFor(props.format)}
      />
    </>
  );
}
