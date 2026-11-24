"use client";
/**
 * "Upload to my channels" for a video whose language has a TikTok account connected.
 *
 * TikTok's rules for apps that post for you ("Direct Post") say the person must see,
 * before every post:
 *  - which TikTok account it goes to (name + picture),
 *  - a "Who can see this video" choice with NOTHING picked for them,
 *  - the caption, which they can change,
 *  - Allow comments / Duet / Stitch switches (off until they turn them on;
 *    greyed out when the account itself has them off),
 *  - a "Disclose video content" switch (Your brand / Branded content),
 *  - the Music Usage Confirmation note.
 * So this button opens a small window with all of that first.
 * The other channels of the same language (YouTube, Facebook, Instagram) get the video too.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/api";
import { getTikTokChoices, uploadVideo, type TikTokChoices } from "@/app/(dashboard)/ready/actions";
import { IconUpload } from "./icons";

/** TikTok's privacy codes in plain words. */
const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends (followers you follow back)",
  FOLLOWER_OF_CREATOR: "My followers",
  SELF_ONLY: "Only me",
};

const MUSIC_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const BRANDED_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

type Props = { variantId: string; label: React.ReactNode };

export function TikTokUploadButton({ variantId, label }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<TikTokChoices | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [posting, startPosting] = useTransition();
  const [result, setResult] = useState<ActionResult>({});

  // The owner's choices. Nothing is picked for them (TikTok's rule).
  const [privacy, setPrivacy] = useState("");
  const [caption, setCaption] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [disclose, setDisclose] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [brandedContent, setBrandedContent] = useState(false);

  function open() {
    setResult({});
    setLoadError(null);
    setChoices(null);
    setPrivacy("");
    setAllowComment(false);
    setAllowDuet(false);
    setAllowStitch(false);
    setDisclose(false);
    setBrandOrganic(false);
    setBrandedContent(false);
    dialog.current?.showModal();
    startLoading(async () => {
      const r = await getTikTokChoices(variantId);
      if (r.message) return setLoadError(r.message);
      if (!r.tiktok) return setLoadError("No TikTok account is connected for this language. Open Channels and press Connect TikTok.");
      setChoices(r.tiktok);
      setCaption(r.tiktok.caption);
    });
  }

  // Branded content cannot be private: if "Only me" was picked, clear it.
  useEffect(() => {
    if (brandedContent && privacy === "SELF_ONLY") setPrivacy("");
  }, [brandedContent, privacy]);

  const creator = choices?.creator ?? null;
  const tooLong = Boolean(creator?.maxDurationSec && choices?.durationSec && choices.durationSec > creator.maxDurationSec);
  const discloseMissing = disclose && !brandOrganic && !brandedContent;
  const canPost = Boolean(creator) && privacy !== "" && !tooLong && !discloseMissing && caption.length <= 2200 && !posting;

  function post() {
    const form = new FormData();
    form.set("variantId", variantId);
    form.set("tiktok", JSON.stringify({
      privacyLevel: privacy,
      caption,
      allowComment: allowComment && !creator?.commentDisabled,
      allowDuet: allowDuet && !creator?.duetDisabled,
      allowStitch: allowStitch && !creator?.stitchDisabled,
      brandOrganic: disclose && brandOrganic,
      brandedContent: disclose && brandedContent,
    }));
    startPosting(async () => {
      const r = await uploadVideo({}, form);
      setResult(r);
      if (r.ok) dialog.current?.close();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={open} className="btn btn-primary">{label}</button>
      {result.message && (
        <span role="status" className={`max-w-xs text-xs ${result.ok ? "text-ok" : "text-bad"}`}>{result.message}</span>
      )}

      <dialog ref={dialog} aria-labelledby={`tt-title-${variantId}`}
        className="card w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto p-0 text-fg1 backdrop:bg-black/50">
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`tt-title-${variantId}`} className="text-lg font-semibold">Post to TikTok</h2>
            <button type="button" className="btn btn-subtle btn-sm" onClick={() => dialog.current?.close()}>Close</button>
          </div>

          {loading && <p className="text-fg3">Asking TikTok about your account…</p>}
          {loadError && <p role="alert" className="text-bad">{loadError}</p>}
          {choices && !creator && (
            <p role="alert" className="text-bad">
              TikTok did not answer: {choices.error ?? "unknown problem"}. Open Channels and press Reconnect next to TikTok.
            </p>
          )}

          {creator && (
            <>
              {/* 1. Which account */}
              <div className="flex items-center gap-3 rounded-md bg-subtle p-3">
                {creator.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={creator.avatarUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-fg3">Posting to TikTok account</p>
                  <p className="truncate font-semibold">
                    {creator.nickname || creator.username}
                    {creator.username && <span className="font-normal text-fg3"> @{creator.username}</span>}
                  </p>
                </div>
              </div>

              {tooLong && (
                <p role="alert" className="text-bad">
                  This video is {Math.round(choices!.durationSec!)} seconds, but this account can post up to {creator.maxDurationSec} seconds.
                </p>
              )}

              {/* 2. Caption */}
              <label className="block">
                <span className="mb-1 block font-semibold">Caption</span>
                <textarea className="field min-h-24 w-full" value={caption} maxLength={2200}
                  onChange={(e) => setCaption(e.target.value)} />
                <span className="text-xs text-fg3">{caption.length} / 2200</span>
              </label>

              {/* 3. Who can see it: nothing picked until the owner picks */}
              <label className="block">
                <span className="mb-1 block font-semibold">Who can see this video</span>
                <select className="field w-full" value={privacy} onChange={(e) => setPrivacy(e.target.value)} required>
                  <option value="" disabled>Choose…</option>
                  {creator.privacyOptions.map((p) => (
                    <option key={p} value={p} disabled={brandedContent && p === "SELF_ONLY"}>
                      {PRIVACY_LABELS[p] ?? p}{brandedContent && p === "SELF_ONLY" ? " (not for branded content)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {/* 4. Comments / Duet / Stitch */}
              <fieldset>
                <legend className="mb-1 font-semibold">Allow people to</legend>
                <div className="flex flex-wrap gap-4">
                  <Check label="Comment" checked={allowComment} onChange={setAllowComment} disabled={creator.commentDisabled} />
                  <Check label="Duet" checked={allowDuet} onChange={setAllowDuet} disabled={creator.duetDisabled} />
                  <Check label="Stitch" checked={allowStitch} onChange={setAllowStitch} disabled={creator.stitchDisabled} />
                </div>
                {(creator.commentDisabled || creator.duetDisabled || creator.stitchDisabled) && (
                  <p className="mt-1 text-xs text-fg3">Greyed out = turned off in your TikTok app&apos;s privacy settings.</p>
                )}
              </fieldset>

              {/* 5. Disclose video content */}
              <fieldset className="rounded-md border border-stroke p-3">
                <Check label={<b>Disclose video content</b>} checked={disclose} onChange={setDisclose} />
                <p className="mt-1 text-xs text-fg3">Turn on if this video promotes yourself, a brand, a product or a service.</p>
                {disclose && (
                  <div className="mt-2 space-y-2">
                    <Check label="Your brand (you promote yourself or your own business)" checked={brandOrganic} onChange={setBrandOrganic} />
                    <Check label="Branded content (a paid partnership with another brand)" checked={brandedContent} onChange={setBrandedContent} />
                    {discloseMissing && <p className="text-xs text-bad">Pick at least one, or turn the switch off.</p>}
                    {brandOrganic && !brandedContent && <p className="text-xs text-fg3">Your video will be labelled &quot;Promotional content&quot;.</p>}
                    {brandedContent && <p className="text-xs text-fg3">Your video will be labelled &quot;Paid partnership&quot;.</p>}
                  </div>
                )}
              </fieldset>

              {/* 6. Consent */}
              <p className="text-xs text-fg3">
                By posting, you agree to TikTok&apos;s{" "}
                {brandedContent && (<><a href={BRANDED_URL} target="_blank" rel="noreferrer" className="underline">Branded Content Policy</a> and </>)}
                <a href={MUSIC_URL} target="_blank" rel="noreferrer" className="underline">Music Usage Confirmation</a>.
                After you post, TikTok can take a few minutes to process the video before it shows on your profile.
              </p>

              {result.message && !result.ok && <p role="alert" className="text-bad">{result.message}</p>}

              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={!canPost} aria-busy={posting} onClick={post}>
                  <IconUpload className="h-4 w-4" /> {posting ? "Posting…" : "Post"}
                </button>
              </div>
              <p className="text-right text-xs text-fg3">Your other channels of this language get the video too.</p>
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      <span>{label}</span>
    </label>
  );
}
