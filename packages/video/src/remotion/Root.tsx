/**
 * The list of things Remotion can draw:
 *   "Video"     the full video (size and length come from the props)
 *   "Thumbnail" one still picture for YouTube
 */
import { Composition, Still } from "remotion";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/800.css";
import { FPS, sizeFor, thumbnailSizeFor, type ThumbnailProps, type VideoProps } from "../types";
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
        durationInFrames={Math.ceil((sample.durationMs / 1000) * FPS)}
        defaultProps={sample}
        calculateMetadata={({ props }) => ({
          ...sizeFor(props.format),
          // Half a second of quiet at the end, so the video does not cut off sharply.
          durationInFrames: Math.max(1, Math.ceil(((props.durationMs + 500) / 1000) * FPS)),
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
