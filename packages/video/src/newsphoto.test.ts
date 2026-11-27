import assert from "node:assert/strict";
import { test } from "node:test";
import { pickNewsPhotos } from "./newsmedia";

const page = (title: string, licence: string, width = 1600, desc = "", date = "2026-11-23") => ({
  title,
  imageinfo: [
    {
      thumburl: `https://upload.example/${encodeURIComponent(title)}`,
      descriptionurl: `https://commons.example/${encodeURIComponent(title)}`,
      width,
      height: 900,
      extmetadata: {
        LicenseShortName: { value: licence },
        Artist: { value: "<a>Press Information Bureau</a>" },
        ImageDescription: { value: desc },
        DateTimeOriginal: { value: date },
      },
    },
  ],
});

test("news photos: free or Indian government licence only, big enough, about the search words", () => {
  const picks = pickNewsPhotos(
    [
      page("File:Modi meets Nepal PM Balen Shah.jpg", "GODL-India"),
      page("File:Modi meets Nepal PM small.jpg", "GODL-India", 500), // too small for a video
      page("File:Modi Balen Shah handshake.jpg", "© All rights reserved"), // not free
      page("File:Random temple.jpg", "CC BY-SA 4.0"), // not about the search
      page("File:Hyderabad House 2025.jpg", "CC BY 4.0", 2000, "Narendra Modi with Nepal Prime Minister Balen Shah", "2025-01-01"),
      page("File:Modi Balen Shah.svg", "CC0"), // not a photo
    ],
    "Narendra Modi Balen Shah meeting",
  );
  assert.deepEqual(
    picks.map((p) => p.pageUrl.split("/").pop()),
    ["File%3AHyderabad%20House%202025.jpg", "File%3AModi%20meets%20Nepal%20PM%20Balen%20Shah.jpg"],
  );
  assert.match(picks[1]!.credit, /^Photo: Press Information Bureau, GODL-India, Wikimedia Commons$/);
});

test("news photos: nothing for an empty search", () => {
  assert.deepEqual(pickNewsPhotos([page("File:A.jpg", "CC0")], " of the "), []);
});
