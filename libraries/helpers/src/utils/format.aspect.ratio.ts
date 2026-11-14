// The shapes Sharek makes and posts take, as width over height: feed posts,
// stories and reels, banners, phone photos, the AI image presets, link images.
const COMMON_SHAPES: { label: string; ratio: number }[] = [
  { label: '1:1', ratio: 1 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '2:3', ratio: 2 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '1.91:1', ratio: 1.91 },
];

/**
 * `width:height` for a picture's or a video's shape.
 *
 * Within 1% of a common shape it takes that shape's name, which absorbs a
 * resize's rounding (1080 × 1349 is `4:5`). Any other shape reads as its
 * longer side over the shorter, the short side as 1, to two decimals with
 * trailing zeros dropped: `1:1.23` for a tall 1000 × 1234, `2.4:1` for a wide
 * 2400 × 1000.
 *
 * Returns `undefined` unless both sides are positive finite numbers — `0`
 * before the file has loaded, `NaN` when it fails to — so callers omit the
 * shape rather than name one they cannot stand behind.
 */
export const formatAspectRatio = (
  width: number,
  height: number
): string | undefined => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const ratio = width / height;
  const common = COMMON_SHAPES.find(
    (shape) => Math.abs(ratio / shape.ratio - 1) <= 0.01
  );
  if (common) {
    return common.label;
  }
  const longer = Number(
    (Math.max(width, height) / Math.min(width, height)).toFixed(2)
  );
  return width > height ? `${longer}:1` : `1:${longer}`;
};
