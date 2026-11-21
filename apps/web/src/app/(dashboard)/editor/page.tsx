import { redirect } from "next/navigation";

// The old "Editor" placeholder page is gone: scripts, voice and subtitles are on each video's own page.
// Old bookmarks land on the video list instead of an empty page.
export default function Page() {
  redirect("/content");
}
