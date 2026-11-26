import { test } from "node:test";
import assert from "node:assert/strict";
import { nameMatches, pickCommonsPhoto } from "./newsmedia";
import { timeNewsCards } from "./v2build";

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
