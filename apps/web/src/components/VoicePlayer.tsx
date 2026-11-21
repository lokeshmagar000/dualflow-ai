"use client";
/**
 * Audio player with live subtitles.
 * "use client" means this part runs in the browser, because it must react
 * while the audio plays. Every time the audio moves forward ("timeupdate"),
 * we find the subtitle line (cue) for that moment and show it.
 */
import { useState } from "react";

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

export function VoicePlayer({ variantId, lang, cues }: { variantId: string; lang: string; cues: Cue[] }) {
  const [nowMs, setNowMs] = useState(0);
  const current = cues.find((c) => nowMs >= c.startMs && nowMs <= c.endMs);

  return (
    <div className="rounded-lg bg-[#1f1f1f] p-3 text-white">
      <audio
        controls
        preload="metadata"
        src={`/media/${variantId}/audio`}
        onTimeUpdate={(e) => setNowMs(e.currentTarget.currentTime * 1000)}
        className="w-full"
      />
      {/* min-h keeps the box the same size when there is no subtitle */}
      <p lang={lang} className="mt-2 min-h-[3rem] text-center text-lg font-semibold leading-snug">
        {current?.text ?? ""}
      </p>
      <div className="mt-1 flex gap-3 text-xs text-[#adadad]">
        <a href={`/media/${variantId}/srt`} download className="hover:text-white">Download .srt</a>
        <a href={`/media/${variantId}/vtt`} download className="hover:text-white">Download .vtt</a>
        <a href={`/media/${variantId}/audio`} download className="hover:text-white">Download audio</a>
      </div>
    </div>
  );
}
