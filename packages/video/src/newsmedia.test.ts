import { test } from "node:test";
import assert from "node:assert/strict";
import { nameMatches, pickCommonsPhoto, pickWikipediaPhoto } from "./newsmedia";
import { nameSpokenAt, timeNewsCards } from "./v2build";

const page = (title: string, licence: string, w = 600, h = 800) => ({
  title,
  imageinfo: [{ thumburl: `https://upload/${title}`, descriptionurl: `https://commons/${title}`, width: w, height: h, extmetadata: { LicenseShortName: { value: licence }, Artist: { value: "<a>Jane Doe</a>" } } }],
});

test("nameMatches needs first AND last name in the file name", () => {
  assert.equal(nameMatches("File:Narendra Modi 2024.jpg", "Narendra Modi"), true);
  assert.equal(nameMatches("File:Modi rally.jpg", "Narendra Modi"), false);
  assert.equal(nameMatches("File:Modi.jpg", "Modi"), false); // one word is not enough
});

test("pickCommonsPhoto takes only free licences, prefers portrait, keeps the credit", () => {
  const best = pickCommonsPhoto(
    [
      page("File:Narendra Modi wide.jpg", "CC BY-SA 4.0", 1600, 900),
      page("File:Narendra Modi portrait.jpg", "CC BY 2.0"),
      page("File:Narendra Modi copyrighted.jpg", "Copyrighted, used with permission"),
      page("File:Someone else.jpg", "CC0"),
    ],
    "Narendra Modi",
  );
  assert.ok(best);
  assert.match(best!.url, /portrait/);
  assert.equal(best!.credit, "Photo: Jane Doe, CC BY 2.0, Wikimedia Commons");
  assert.equal(pickCommonsPhoto([page("File:Narendra Modi x.jpg", "All rights reserved")], "Narendra Modi"), null);
});

test("news cards show on their line, after the hook, never on top of a number card or each other", () => {
  const base = { kind: "headline" as const, title: "t", by: "", date: "", from: "", to: "", flags: [], points: [] };
  const lines = [
    { order: 1, startMs: 0, endMs: 2500 },
    { order: 2, startMs: 2600, endMs: 6000 },
    { order: 3, startMs: 6100, endMs: 9000 },
    { order: 4, startMs: 9100, endMs: 12000 },
  ];
  const out = timeNewsCards([{ ...base, order: 2 }, { ...base, order: 3 }, { ...base, order: 4 }], lines, [{ startMs: 9300, endMs: 11000 }]);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.startMs, 2800);
  assert.ok(out.every((c) => c.startMs < 9300 || c.startMs > 11000));
});

test("Wikipedia lead photo: used only with a free licence", () => {
  assert.equal(pickWikipediaPhoto(page("File:Balen Shah.jpg", "CC BY-SA 4.0"))?.credit, "Photo: Jane Doe, CC BY-SA 4.0, Wikimedia Commons");
  assert.equal(pickWikipediaPhoto(page("File:Balen Shah.jpg", "Fair use")), null);
  assert.equal(pickWikipediaPhoto(undefined), null);
});

const w = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 300 });

test("nameSpokenAt finds the name inside its line (English and Nepali endings)", () => {
  const words = [w("Prime", 3000), w("Minister", 3300), w("Modi's", 3700), w("visit", 4000), w("मोदीले", 8000)];
  assert.equal(nameSpokenAt("Modi", words, { startMs: 2900, endMs: 5000 }), 3700);
  assert.equal(nameSpokenAt("मोदी", words, { startMs: 7000, endMs: 9000 }), 8000);
  assert.equal(nameSpokenAt("Oli", words, { startMs: 2900, endMs: 5000 }), null);
});

test("a person's photo shows when the name is said and wins over other graphics", () => {
  const base = { title: "", by: "", date: "", from: "", to: "", flags: [], points: [] };
  const lines = [
    { order: 1, startMs: 0, endMs: 2500 },
    { order: 2, startMs: 2600, endMs: 8000 },
  ];
  const words = [w("The", 2600), w("talks", 3000), w("with", 4200), w("Modi", 5000), w("ended", 5400)];
  const out = timeNewsCards(
    [
      { ...base, order: 2, kind: "headline" },
      { ...base, order: 2, kind: "photo", say: "Modi", photo: { src: "p.jpg", credit: "c" } },
    ],
    lines,
    [],
    words,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, "photo");
  assert.equal(out[0]!.startMs, 4880);
  assert.equal("say" in out[0]!, false);
});
