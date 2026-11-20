"use client";
/**
 * The bulk upload form: pick a video once, write one caption, press one button.
 *
 * What happens when you press "Send everywhere":
 *   1. The browser reads the video's length and size (no upload yet) and checks each
 *      platform's rules, so you see problems BEFORE waiting for a big upload.
 *   2. startBulkUpload() gives us an upload address.
 *   3. The browser sends the video there, with a progress bar (XMLHttpRequest can show progress).
 *   4. createBulkUpload() makes one upload per ticked channel and starts the upload run.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkLimits, LIMITS, niceDuration, niceSize, pickFormat, type VideoFacts } from "@dualflow/publish/limits";
import type { BulkChannel } from "@/lib/api";
import { createBulkUpload, startBulkUpload } from "./actions";

type Lang = "ne" | "en";
type Step = "idle" | "uploading" | "saving" | "done" | "error";

const LANG_LABEL: Record<Lang, string> = { ne: "नेपाली (Nepali)", en: "English" };
/** Devanagari letters (the Nepali alphabet) are in this Unicode range. */
const DEVANAGARI = /[ऀ-ॿ]/;

/** Read length and picture size from the file, without uploading it. */
function readVideoFacts(file: File): Promise<Omit<VideoFacts, "sizeBytes">> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (facts: Omit<VideoFacts, "sizeBytes">) => {
      URL.revokeObjectURL(url); // free the memory
      resolve(facts);
    };
    video.onloadedmetadata = () =>
      done({ durationSec: Number.isFinite(video.duration) ? video.duration : null, width: video.videoWidth || null, height: video.videoHeight || null });
    video.onerror = () => done({ durationSec: null, width: null, height: null }); // e.g. a .mov this browser cannot read
    video.src = url;
  });
}

/** Send the file with a progress bar. Resolves when the upload is finished. */
function sendFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The storage said ${xhr.status}.`)));
    // A network error here is almost always a missing CORS rule on the R2 bucket.
    xhr.onerror = () => reject(new Error("The video could not be sent. If you use R2, add the CORS rule from docs/bulk-upload.md."));
    xhr.send(file);
  });
}

/** "#nepal, #facts everest" -> ["nepal", "facts", "everest"] */
function parseHashtags(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").trim()).filter(Boolean))].slice(0, 30);
}

export function BulkUploadForm({ channels, storage }: { channels: BulkChannel[]; storage: "r2" | "local" }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [facts, setFacts] = useState<VideoFacts | null>(null);
  const [language, setLanguage] = useState<Lang>("ne");
  const [languageTouched, setLanguageTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  // Show a small preview; free its memory when the file changes.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Typing Nepali letters picks the Nepali channels (until you choose the language yourself).
  useEffect(() => {
    if (!languageTouched && (title || caption)) setLanguage(DEVANAGARI.test(title + caption) ? "ne" : "en");
  }, [title, caption, languageTouched]);

  const myChannels = channels.filter((c) => c.language === language);
  // useMemo: only re-check the rules when the video or the channels change.
  const checks = useMemo(
    () => Object.fromEntries(myChannels.map((c) => [c.id, facts ? checkLimits(c.platform.toLowerCase() as never, facts) : null])),
    [facts, language, channels], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const chosen = myChannels.filter((c) => !unticked.has(c.id) && checks[c.id]?.ok !== false);
  const busy = step === "uploading" || step === "saving";
  const tooBig = file ? file.size > LIMITS.pageMaxBytes : false;
  const canSend = !!file && !tooBig && title.trim().length > 0 && chosen.length > 0 && !busy;

  async function pickFile(f: File | null) {
    setFile(f);
    setFacts(null);
    setStep("idle");
    setMessage("");
    if (!f) return;
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 100));
    setFacts({ sizeBytes: f.size, ...(await readVideoFacts(f)) });
  }

  function toggle(id: string) {
    setUnticked((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!file || !facts || !canSend) return;
    setStep("uploading");
    setProgress(0);
    setMessage("");
    try {
      const contentType = file.type || (file.name.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      const start = await startBulkUpload({ fileName: file.name, sizeBytes: file.size, contentType });
      if (!start.ok) throw new Error(start.error);
      // R2: straight to R2. Local storage: through our own dashboard route.
      const target = start.uploadUrl ?? `/bulk-upload/file?key=${encodeURIComponent(start.key)}`;
      await sendFile(target, new File([file], file.name, { type: contentType }), setProgress);

      setStep("saving");
      const made = await createBulkUpload({
        key: start.key,
        language,
        title: title.trim(),
        caption: caption.trim(),
        hashtags: parseHashtags(hashtags),
        durationSec: facts.durationSec ?? null,
        width: facts.width ?? null,
        height: facts.height ?? null,
        channelIds: chosen.map((c) => c.id),
      });
      if (!made.ok) throw new Error(made.error);
      setStep("done");
      setMessage(`Sent to ${chosen.length} channel${chosen.length > 1 ? "s" : ""}. ${made.message} Each platform's result shows below.`);
      // Clear the form for the next video, and show the new upload in the list.
      setFile(null);
      setFacts(null);
      setTitle("");
      setCaption("");
      setHashtags("");
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (err) {
      setStep("error");
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* 1. The video */}
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-6 text-center hover:border-brand-500"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pickFile(e.dataTransfer.files[0] ?? null);
          }}
        >
          <span className="text-sm font-semibold">{file ? file.name : "Drop your video here, or tap to choose"}</span>
          <span className="text-xs text-zinc-500">
            .mp4 or .mov, up to {niceSize(LIMITS.pageMaxBytes)}
            {facts && ` · ${niceSize(facts.sizeBytes)}`}
            {facts?.durationSec ? ` · ${niceDuration(facts.durationSec)}` : ""}
            {facts?.width ? ` · ${facts.width}×${facts.height}` : ""}
            {facts && ` · ${pickFormat(facts) === "SHORT" ? "Short (vertical)" : "Long video"}`}
          </span>
          <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="sr-only" disabled={busy}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        {tooBig && <p className="text-sm text-red-600">This file is too big for the page ({niceSize(file!.size)}).</p>}
        {facts && !facts.durationSec && <p className="text-sm text-amber-700">This browser could not read the video's length, so the length rules are checked by each platform.</p>}

        {/* 2. Language: decides which channels get it */}
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Language of the video</legend>
          <div className="flex gap-2">
            {(["ne", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" disabled={busy}
                onClick={() => { setLanguage(l); setLanguageTouched(true); }}
                className={`rounded-lg px-4 py-2 text-sm ring-1 ${language === l ? "bg-brand-500 text-white ring-brand-500" : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"}`}>
                {LANG_LABEL[l]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-zinc-500">Nepali videos go only to your Nepali channels, English videos only to your English channels.</p>
        </fieldset>

        {/* 3. Words */}
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="bulk-title">Title <span className="text-zinc-400">({title.length}/100)</span></label>
          <input id="bulk-title" value={title} maxLength={100} disabled={busy} onChange={(e) => setTitle(e.target.value)} lang={language}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="e.g. 5 facts about Mount Everest" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="bulk-caption">Caption <span className="text-zinc-400">({caption.length}/2200)</span></label>
          <textarea id="bulk-caption" value={caption} maxLength={2200} rows={4} disabled={busy} onChange={(e) => setCaption(e.target.value)} lang={language}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="One caption for every platform" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="bulk-tags">Hashtags <span className="text-zinc-400">(optional, up to 30)</span></label>
          <input id="bulk-tags" value={hashtags} disabled={busy} onChange={(e) => setHashtags(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="#nepal #facts #NamasteFacts" />
        </div>
      </div>

      {/* 4. Channels, with each platform's rules checked */}
      <div className="space-y-4">
        {preview && <video src={preview} controls muted playsInline className="max-h-72 w-full rounded-xl bg-black" />}
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="mb-2 text-sm font-semibold">Send to ({chosen.length}/{myChannels.length})</p>
          {myChannels.length === 0 && (
            <p className="text-sm text-zinc-500">
              No {language === "ne" ? "Nepali" : "English"} channels yet. Add the tokens (docs/social-setup.md), then run
              &quot;Test my channels&quot; in GitHub Actions.
            </p>
          )}
          <ul className="space-y-3">
            {myChannels.map((c) => {
              const check = checks[c.id];
              const blocked = check?.ok === false;
              return (
                <li key={c.id}>
                  <label className={`flex items-center gap-2 text-sm ${blocked ? "text-zinc-400" : ""}`}>
                    <input type="checkbox" disabled={busy || blocked} checked={!blocked && !unticked.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="font-medium">{c.name}</span>
                    {check && <span className={blocked ? "text-red-600" : "text-emerald-600"}>{blocked ? "✗ will refuse it" : "✓ fits"}</span>}
                  </label>
                  {check?.problems.map((p) => <p key={p} className="ml-6 text-xs text-red-600">{p}</p>)}
                  {check?.notes.map((n) => <p key={n} className="ml-6 text-xs text-zinc-500">{n}</p>)}
                </li>
              );
            })}
          </ul>
        </div>

        <button type="button" onClick={send} disabled={!canSend}
          className="w-full rounded-xl bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40">
          {step === "uploading" ? `Sending video… ${progress}%` : step === "saving" ? "Starting the uploads…" : "Send everywhere"}
        </button>
        {step === "uploading" && (
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {message && (
          <p className={`rounded-lg p-3 text-sm ${step === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{message}</p>
        )}
        {storage === "local" && <p className="text-xs text-zinc-500">Local storage: the video is saved on this computer.</p>}
      </div>
    </div>
  );
}
