/**
 * The two shapes a video can be rendered in. `VideoDto.output` already
 * validates these two literals; this module adds the presentation facts the
 * orientation tiles need — ratio and glyph geometry — so the shape shown in the
 * UI cannot drift from the id sent to the API.
 *
 * Zero imports, deliberately: the frontend imports this module, and anything
 * imported here would be pulled into the browser bundle
 * (`dtos/media/image.generation.catalog.ts` is the precedent).
 *
 * `label` and the tooltips are the English defaults the UI passes to
 * `t('video_orientation_<id>', …)` per the project's i18n convention — the
 * displayed text always comes from the locale files.
 */

/** Glyph sizes are the approved mockup's, drawn to fit a 23px box. */
export const VIDEO_ORIENTATIONS = {
  vertical: { ratio: '9:16', glyph: { width: 13, height: 23 } },
  horizontal: { ratio: '16:9', glyph: { width: 23, height: 13 } },
} as const;

export type VideoOrientationId = keyof typeof VIDEO_ORIENTATIONS;

export const VIDEO_ORIENTATION_IDS = Object.keys(
  VIDEO_ORIENTATIONS
) as VideoOrientationId[];

export const VIDEO_ORIENTATION_LABELS: Record<VideoOrientationId, string> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

/** HTML, as react-tooltip renders these through `data-tooltip-html`. */
export const VIDEO_ORIENTATION_TOOLTIPS: Record<VideoOrientationId, string> = {
  vertical:
    '<strong>Vertical · 9:16</strong><br />Instagram Stories &amp; Reels · TikTok · YouTube Shorts.<br /><span style="opacity:.72">Fills a phone screen top to bottom.</span>',
  horizontal:
    '<strong>Horizontal · 16:9</strong><br />X &amp; LinkedIn posts · YouTube · websites.<br /><span style="opacity:.72">The classic landscape frame.</span>',
};
