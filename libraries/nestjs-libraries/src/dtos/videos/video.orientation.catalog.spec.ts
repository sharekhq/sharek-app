// The orientation ids the modal offers are the same two literals the API
// validates, and the tiles that render them get their ratio and glyph from the
// same module — so the shape shown to the user cannot drift from the id sent to
// the renderer. (feature 007-ai-video-modal-v2, foundational.)
import {
  VIDEO_ORIENTATION_IDS,
  VIDEO_ORIENTATION_LABELS,
  VIDEO_ORIENTATION_TOOLTIPS,
  VIDEO_ORIENTATIONS,
} from './video.orientation.catalog';

describe('video orientation catalog', () => {
  // Deliberately the literal list rather than a derived one: these are exactly
  // the values `VideoDto.output` accepts (`@IsIn(['vertical', 'horizontal'])`),
  // and importing that DTO here would pull the whole video registry in.
  it('offers exactly the two orientations the API accepts, in display order', () => {
    expect(VIDEO_ORIENTATION_IDS).toEqual(['vertical', 'horizontal']);
  });

  const expected: [string, string][] = [
    ['vertical', '9:16'],
    ['horizontal', '16:9'],
  ];

  it.each(expected)('renders %s at %s', (id, ratio) => {
    expect(VIDEO_ORIENTATIONS[id as keyof typeof VIDEO_ORIENTATIONS].ratio).toBe(
      ratio
    );
  });

  // The glyph is drawn from these numbers; a zero edge would collapse the tile
  // into a line rather than a proportional preview of the shape.
  it.each(VIDEO_ORIENTATION_IDS)('gives %s a drawable glyph', (id) => {
    const { glyph } = VIDEO_ORIENTATIONS[id];
    expect(glyph.width).toBeGreaterThan(0);
    expect(glyph.height).toBeGreaterThan(0);
  });

  it.each(VIDEO_ORIENTATION_IDS)('gives %s a glyph matching its ratio', (id) => {
    const { glyph, ratio } = VIDEO_ORIENTATIONS[id];
    const [width, height] = ratio.split(':').map(Number);
    expect(glyph.width / glyph.height).toBeCloseTo(width / height, 1);
  });

  // These are the English defaults the UI hands to t('video_orientation_<id>',
  // …); an empty one renders as an unlabelled tile in any locale missing the key.
  it.each(VIDEO_ORIENTATION_IDS)('gives %s a non-empty label', (id) => {
    expect(typeof VIDEO_ORIENTATION_LABELS[id]).toBe('string');
    expect(VIDEO_ORIENTATION_LABELS[id].trim().length).toBeGreaterThan(0);
  });

  it.each(VIDEO_ORIENTATION_IDS)('gives %s a non-empty tooltip', (id) => {
    expect(typeof VIDEO_ORIENTATION_TOOLTIPS[id]).toBe('string');
    expect(VIDEO_ORIENTATION_TOOLTIPS[id].trim().length).toBeGreaterThan(0);
  });

  it('labels and describes every id it offers, and no others', () => {
    expect(Object.keys(VIDEO_ORIENTATION_LABELS).sort()).toEqual(
      [...VIDEO_ORIENTATION_IDS].sort()
    );
    expect(Object.keys(VIDEO_ORIENTATION_TOOLTIPS).sort()).toEqual(
      [...VIDEO_ORIENTATION_IDS].sort()
    );
  });
});
