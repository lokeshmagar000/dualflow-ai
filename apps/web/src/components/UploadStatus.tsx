/** Shows where one upload is, in plain words. */
const LABELS: Record<string, { text: string; className: string }> = {
  READY: { text: "waiting for your approval", className: "bg-brand-tint text-brand-fg" },
  SCHEDULED: { text: "in the queue", className: "bg-info-tint text-info" },
  GENERATING: { text: "uploading", className: "bg-warn-tint text-warn" },
  PUBLISHED: { text: "uploaded", className: "bg-ok-tint text-ok" },
  FAILED: { text: "failed", className: "bg-bad-tint text-bad" },
};

export function UploadStatus({ status }: { status: string }) {
  const l = LABELS[status] ?? { text: status.toLowerCase(), className: "bg-subtle2 text-fg2" };
  return <span className={`badge ${l.className}`}>{l.text}</span>;
}

/** "Thu 19 Nov, 18:45" in Nepal time. */
export function nepalTime(iso: string | null) {
  if (!iso) return "next free time";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kathmandu", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}
