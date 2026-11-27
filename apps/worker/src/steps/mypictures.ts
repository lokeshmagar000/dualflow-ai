/**
 * "My pictures": photos or clips YOU add to a story on the Ready page (for example real photos
 * from the Nepal PM office or the news agency RSS, used with permission). They always win over
 * pictures the robot finds.
 */
export type MyPicture = { key: string; kind: "image" | "video"; credit?: string; name?: string };

/**
 * Which line (scene order, 1, 2, 3...) gets which of your pictures (0, 1, 2...).
 * Lines about the news event (those that would get a news photo) come first, in order; the rest
 * of your pictures are spread evenly over the other lines (never the first line, the hook).
 */
export function pictureSpots(newsLines: boolean[], count: number): Map<number, number> {
  const spots = new Map<number, number>();
  if (count <= 0 || newsLines.length === 0) return spots;
  const orders = newsLines.map((_, i) => i + 1);
  const first = orders.filter((o) => newsLines[o - 1]);
  const others = orders.filter((o) => !newsLines[o - 1] && o > 1);
  const picked = first.slice(0, count);
  const left = count - picked.length;
  if (left > 0 && others.length) {
    const step = others.length / Math.min(left, others.length);
    for (let j = 0; j < Math.min(left, others.length); j++) picked.push(others[Math.floor(j * step)]!);
  }
  picked.forEach((order, k) => spots.set(order, k));
  return spots;
}
