"use client";
/**
 * "My pictures" panel under a story on the Ready page, and under a waiting idea on the Ideas page.
 *  - Add your own real photos (or short .mp4 clips), with a credit line ("Photo: RSS").
 *  - Press "Remake video with my pictures": same script and voice, your pictures come first
 *    (lines about the news event first, the rest spread over the video). No AI writing is paid again.
 * On the Ideas page there is no Remake: add pictures, then press "Make video" (the video uses them).
 * Use only pictures you made yourself or have permission / a free licence to use.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addMyPicture, remakeStory, removeMyPicture, startMyPicture, type PictureTarget } from "@/app/(dashboard)/ready/mypictures-actions";

import type { MyPictureRow } from "@/lib/api";
export type { MyPictureRow };

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4";

/** Send one file to its upload address (R2). */
function sendFile(url: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The storage said ${xhr.status}.`)));
    xhr.onerror = () => reject(new Error("The picture could not be sent. Check the R2 CORS rule (docs/bulk-upload.md)."));
    xhr.send(file);
  });
}

export function MyPictures({ id, pictures, target = "stories" }: { id: string; pictures: MyPictureRow[]; target?: PictureTarget }) {
  const isIdea = target === "topics";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(pictures.length > 0);
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setMessage(null);
    let added = 0;
    for (const file of Array.from(files)) {
      setBusy(`Sending ${file.name}…`);
      try {
        const start = await startMyPicture(target, id, { fileName: file.name, sizeBytes: file.size, contentType: file.type });
        if (!start.ok) throw new Error(start.error);
        if (!start.uploadUrl) throw new Error("My pictures need the Cloudflare R2 video storage.");
        await sendFile(start.uploadUrl, file);
        const saved = await addMyPicture(target, id, { key: start.key, credit: credit.trim(), name: file.name });
        if (!saved.ok) throw new Error(saved.error);
        added++;
      } catch (e) {
        setMessage({ text: `${file.name}: ${(e as Error).message}`, bad: true });
        break;
      }
    }
    setBusy("");
    if (input.current) input.current.value = "";
    if (added) setMessage({ text: `${added} picture(s) added. ${isIdea ? 'Press "Make video" when you are ready.' : 'Press "Remake video with my pictures" when you are ready.'}` });
    router.refresh();
  }

  async function remove(n: number) {
    setBusy("Removing…");
    const r = await removeMyPicture(target, id, n);
    setBusy("");
    if (!r.ok) setMessage({ text: r.error, bad: true });
    router.refresh();
  }

  async function remake() {
    if (!window.confirm("Make this story's videos again with your pictures?\n\nSame script and voice. It takes about 30-90 minutes, and the story is hidden here until the new videos are ready.")) return;
    setBusy("Starting…");
    const r = await remakeStory(id);
    setBusy("");
    setMessage(r.ok ? { text: r.message } : { text: r.error, bad: true });
    router.refresh();
  }

  if (!open) {
    return (
      <div className={isIdea ? "mt-1" : "border-t border-stroke px-4 py-2 sm:px-5"}>
        <button className="link text-sm" onClick={() => setOpen(true)}>+ Add my own pictures / videos{isIdea ? "" : " to this story"}</button>
      </div>
    );
  }
  return (
    <div className={isIdea ? "mt-2 w-full rounded border border-stroke p-3 text-sm" : "border-t border-stroke px-4 py-3 text-sm sm:px-5"}>
      <p className="font-semibold">My pictures</p>
      {isIdea ? (
        <p className="mt-0.5 text-fg2">
          Add real photos or short .mp4 clips for this idea (yours, or used with permission). Then press Make video: your pictures come
          first, news lines first, and the robot finds the rest.
        </p>
      ) : (
        <p className="mt-0.5 text-fg2">
          Add real photos or short .mp4 clips (yours, or used with permission). They replace the robot&apos;s pictures, news lines first.
          Then press Remake: same script and voice, no new AI cost.
        </p>
      )}
      {pictures.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {pictures.map((p) => (
            <li key={p.n} className="w-28 rounded border border-stroke p-1">
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt={p.name} className="h-16 w-full rounded object-cover" />
              ) : (
                <div className="flex h-16 items-center justify-center rounded bg-subtle2 text-xs text-fg3">{p.kind === "video" ? "clip" : "photo"}</div>
              )}
              <p className="mt-1 truncate text-xs" title={p.name}>{p.n + 1}. {p.name || p.kind}</p>
              {p.credit && <p className="truncate text-[11px] text-fg3" title={p.credit}>{p.credit}</p>}
              <button className="link text-xs text-bad" disabled={Boolean(busy)} onClick={() => remove(p.n)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className="field h-8 w-56 text-sm"
          placeholder='Credit, e.g. "Photo: RSS"'
          value={credit}
          maxLength={120}
          onChange={(e) => setCredit(e.target.value)}
        />
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => input.current?.click()}>Add pictures</button>
        {!isIdea && (
          <button className="btn btn-sm btn-primary" disabled={Boolean(busy) || pictures.length === 0} onClick={remake}>
            Remake video with my pictures
          </button>
        )}
        {busy && <span className="text-fg3">{busy}</span>}
      </div>
      {message && <p role="status" className={`mt-1 ${message.bad ? "text-bad" : "text-ok"}`}>{message.text}</p>}
    </div>
  );
}
