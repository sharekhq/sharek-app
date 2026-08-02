// Guards the shared image-generation catalog against drift. The four presets
// are the feature's central promise — a tooltip names exact pixels, so a preset
// that quietly changes size lies to the user — and the style catalog is the one
// list the DTO validates against, the modal renders and the locale files are
// keyed off, so its shape has to be pinned in one place.
// (feature 006-ai-image-modal-v2, foundational.)
import {
  IMAGE_ASPECT_IDS,
  IMAGE_ASPECT_PRESETS,
  IMAGE_POPULAR_STYLE_IDS,
  IMAGE_POPULAR_STYLES,
  IMAGE_STYLES,
  IMAGE_STYLE_CATEGORIES,
  IMAGE_STYLE_CATEGORY_LABELS,
  IMAGE_STYLE_IDS,
  ImageAspectId,
  ImageStyleCategory,
} from './image.generation.catalog';

describe('image aspect presets', () => {
  it('offers exactly the four presets, in display order', () => {
    expect(IMAGE_ASPECT_IDS).toEqual([
      'square',
      'portrait',
      'story',
      'landscape',
    ]);
  });

  const expected: [ImageAspectId, string, string][] = [
    ['square', '1:1', '1024x1024'],
    ['portrait', '4:5', '1024x1280'],
    ['story', '9:16', '1008x1792'],
    ['landscape', '16:9', '1792x1008'],
  ];

  it.each(expected)('renders %s (%s) at exactly %s', (id, ratio, size) => {
    expect(IMAGE_ASPECT_PRESETS[id]).toEqual({ ratio, size });
  });

  // gpt-image-2 rejects any size whose edges are not both divisible by 16 —
  // which is why Story is 1008x1792 rather than the arithmetically exact 9:16.
  it('keeps both edges of every render size divisible by 16', () => {
    for (const { size } of Object.values(IMAGE_ASPECT_PRESETS)) {
      const [width, height] = size.split('x').map(Number);
      expect(width % 16).toBe(0);
      expect(height % 16).toBe(0);
    }
  });
});

describe('image style catalog', () => {
  it('lists the six categories in display order', () => {
    expect(IMAGE_STYLE_CATEGORIES).toEqual([
      'photography',
      'illustration',
      'three_d_digital',
      'painting_craft',
      'heritage_pattern',
      'minimal_bold',
    ]);
  });

  it('gives every category an English label', () => {
    expect(Object.keys(IMAGE_STYLE_CATEGORY_LABELS).sort()).toEqual(
      [...IMAGE_STYLE_CATEGORIES].sort()
    );
    for (const label of Object.values(IMAGE_STYLE_CATEGORY_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('holds 43 styles with unique ids', () => {
    expect(IMAGE_STYLES).toHaveLength(43);
    expect(new Set(IMAGE_STYLE_IDS).size).toBe(43);
  });

  const counts: [ImageStyleCategory, number][] = [
    ['photography', 9],
    ['illustration', 7],
    ['three_d_digital', 7],
    ['painting_craft', 7],
    ['heritage_pattern', 5],
    ['minimal_bold', 8],
  ];

  it.each(counts)('puts %s styles in %s', (category, count) => {
    expect(IMAGE_STYLES.filter((s) => s.category === category)).toHaveLength(
      count
    );
  });

  it('groups the catalog by category in display order', () => {
    const order = IMAGE_STYLES.map((s) =>
      IMAGE_STYLE_CATEGORIES.indexOf(s.category)
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  // The phrase is what actually reaches the prompt-enhancement step; an empty
  // one would silently turn a chosen style into Auto.
  it('gives every style a non-empty English prompt phrase', () => {
    for (const style of IMAGE_STYLES) {
      expect(typeof style.prompt).toBe('string');
      expect(style.prompt.trim().length).toBeGreaterThan(0);
      expect(style.prompt).toMatch(/^[\x20-\x7E]+$/);
    }
  });

  // The English default the UI hands to t('image_style_<id>', …); the shown
  // name still comes from the locale files.
  it('gives every style a non-empty English label', () => {
    for (const style of IMAGE_STYLES) {
      expect(typeof style.label).toBe('string');
      expect(style.label.trim().length).toBeGreaterThan(0);
    }
  });

  // Auto is a UI sentinel, not a catalog entry — the request simply omits
  // `style` — so it must never become a selectable id the DTO would accept.
  it('does not carry an "auto" entry', () => {
    expect(IMAGE_STYLE_IDS).not.toContain('auto');
  });
});

describe('popular styles (the collapsed row)', () => {
  // Ordered rather than a per-entry flag: the row's order is part of the
  // approved design and differs from catalog order (Minimalist before
  // Watercolor), which a boolean cannot express.
  it('names exactly the approved six, in row order', () => {
    expect(IMAGE_POPULAR_STYLE_IDS).toEqual([
      'realistic_photo',
      'flat_illustration',
      'cartoon',
      'three_d_render',
      'minimalist',
      'watercolor',
    ]);
  });

  it('only names styles that exist in the catalog', () => {
    for (const id of IMAGE_POPULAR_STYLE_IDS) {
      expect(IMAGE_STYLE_IDS).toContain(id);
    }
  });

  it('resolves each one to its catalog entry, in row order', () => {
    expect(IMAGE_POPULAR_STYLES.map((style) => style.id)).toEqual(
      IMAGE_POPULAR_STYLE_IDS
    );
  });
});
