/**
 * Small line icons drawn in the Fluent "Regular" style (thin, rounded lines).
 * Each one is plain SVG, so no extra package is needed and they follow the text color.
 */
type P = { className?: string };
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconHome = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 8.5 10 3l6.5 5.5V16a1 1 0 0 1-1 1H12v-4.5H8V17H4.5a1 1 0 0 1-1-1z" /></svg>
);
export const IconSparkle = (p: P) => (
  <svg {...base} {...p}><path d="M8 2.5 9.4 6.6 13.5 8l-4.1 1.4L8 13.5 6.6 9.4 2.5 8l4.1-1.4zM14.5 12l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></svg>
);
export const IconVideo = (p: P) => (
  <svg {...base} {...p}><rect x="2.5" y="5" width="11" height="10" rx="2" /><path d="m13.5 8.5 4-2.5v8l-4-2.5" /></svg>
);
export const IconImages = (p: P) => (
  <svg {...base} {...p}><rect x="2.5" y="4.5" width="12" height="10" rx="2" /><path d="M5.5 17h9a3 3 0 0 0 3-3V7.5" /><path d="m4.5 12.5 3-3 2.5 2.5 1.5-1.5 2 2" /></svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} {...p}><path d="M10 3v9.5M6 9l4 4 4-4M4 16.5h12" /></svg>
);
export const IconClock = (p: P) => (
  <svg {...base} {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 2" /></svg>
);
export const IconUpload = (p: P) => (
  <svg {...base} {...p}><path d="M10 13.5V4M6 7.5l4-4 4 4M4 16.5h12" /></svg>
);
export const IconPeople = (p: P) => (
  <svg {...base} {...p}><circle cx="7.5" cy="7" r="2.75" /><path d="M2.5 16c.4-2.6 2.4-4.25 5-4.25s4.6 1.65 5 4.25" /><circle cx="14" cy="7.5" r="2.25" /><path d="M14 11.75c1.9 0 3.3 1.2 3.5 3.25" /></svg>
);
export const IconChart = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 16.5h13M6 13.5V9M10 13.5V5M14 13.5v-6" /></svg>
);
export const IconMoney = (p: P) => (
  <svg {...base} {...p}><rect x="2.5" y="5" width="15" height="10" rx="2" /><circle cx="10" cy="10" r="2" /><path d="M5.5 8v4M14.5 8v4" /></svg>
);
export const IconSettings = (p: P) => (
  <svg {...base} {...p}><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></svg>
);
export const IconSignOut = (p: P) => (
  <svg {...base} {...p}><path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" /></svg>
);
export const IconMenu = (p: P) => (
  <svg {...base} {...p}><path d="M3 5.5h14M3 10h14M3 14.5h14" /></svg>
);
export const IconDismiss = (p: P) => (
  <svg {...base} {...p}><path d="m5 5 10 10M15 5 5 15" /></svg>
);
export const IconSun = (p: P) => (
  <svg {...base} {...p}><circle cx="10" cy="10" r="3.25" /><path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1" /></svg>
);
export const IconMoon = (p: P) => (
  <svg {...base} {...p}><path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2z" /></svg>
);
export const IconDesktop = (p: P) => (
  <svg {...base} {...p}><rect x="2.5" y="3.5" width="15" height="10" rx="1.5" /><path d="M7 17h6M10 13.5V17" /></svg>
);
export const IconWarning = (p: P) => (
  <svg {...base} {...p}><path d="M10 3.5 2.8 16h14.4zM10 8.5v3.5M10 14.2v.1" /></svg>
);
export const IconRefresh = (p: P) => (
  <svg {...base} {...p}><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3" /></svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 5.5h13M8 5.5V4h4v1.5M5 5.5l.8 10.1a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L15 5.5" /></svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} {...p}><path d="m4 10.5 4 4 8-9" /></svg>
);
export const IconBolt = (p: P) => (
  <svg {...base} {...p}><path d="M11 2.5 4.5 11H10l-1 6.5 6.5-8.5H10z" /></svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base} {...p}><path d="m8 5 5 5-5 5" /></svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base} {...p}><path d="m12 5-5 5 5 5" /></svg>
);
export const IconCopy = (p: P) => (
  <svg {...base} {...p}><rect x="6.5" y="6.5" width="10" height="10" rx="1.5" /><path d="M13.5 6.5V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" /></svg>
);
export const IconOpen = (p: P) => (
  <svg {...base} {...p}><path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5M14.5 11.5V15a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5h3.5" /></svg>
);
