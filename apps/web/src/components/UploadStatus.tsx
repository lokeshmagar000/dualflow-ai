/** Shows where one upload is, in plain words. */
const LABELS: Record<string, { text: string; className: string }> = {
  READY: { text: "waiting for your approval", className: "bg-sky-100 text-sky-800" },
  SCHEDULED: { text: "in the queue", className: "bg-violet-100 text-violet-800" },
  GENERATING: { text: "uploading", className: "bg-amber-100 text-amber-800" },
  PUBLISHED: { text: "uploaded", className: "bg-emerald-100 text-emerald-800" },
  FAILED: { text: "failed", className: "bg-red-100 text-red-800" },
};

export function UploadStatus({ status }: { status: string }) {
  const l = LABELS[status] ?? { text: status.toLowerCase(), className: "bg-zinc-100" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.className}`}>{l.text}</span>;
}

/** "Thu 19 Nov, 18:45" in Nepal time. */
export function nepalTime(iso: string | null) {
  if (!iso) return "next free time";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
