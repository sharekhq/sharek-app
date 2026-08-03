// Every string the AI image modal shows has to exist in BOTH locales: a key
// that lives only as an inline English default renders English in the Arabic
// UI, which is exactly how the modal's style list stayed untranslated before
// this feature. The manifest below is deliberately exhaustive — derived keys
// for the catalog, literal keys for everything else (SC-006).
// (feature 006-ai-image-modal-v2, US3.)
import * as fs from 'fs';
import * as path from 'path';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_STYLE_CATEGORIES,
  IMAGE_STYLE_IDS,
} from './image.generation.catalog';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;

const en = readLocale('en');
const ar = readLocale('ar');

const KEYS = [
  // Shape presets (T010). Named Orientation, the video modal's word for the
  // same control, so one concept does not go by two names across the two AI
  // modals.
  'image_orientation',
  ...IMAGE_ASPECT_IDS.map((id) => `image_aspect_${id}`),
  ...IMAGE_ASPECT_IDS.map((id) => `image_aspect_${id}_tooltip`),
  // The prompt field's own line: what to write, and how much room is left.
  'image_prompt_hint',
  'prompt_counter',
  // Generating / result states and actions (T013)
  'creating_your_image',
  'usually_takes_half_minute',
  'close_window_note',
  'use_image',
  'open_image_full_size',
  'image_uses_one_credit',
  'regenerate',
  'one_credit',
  'edit_prompt',
  'auto_style',
  // Style catalog UI (T019)
  'all_styles',
  'search_styles',
  'show_less',
  'no_styles_found',
  // The catalog itself
  ...IMAGE_STYLE_IDS.map((id) => `image_style_${id}`),
  ...IMAGE_STYLE_CATEGORIES.map((id) => `image_style_cat_${id}`),
];

// Arabic counts a noun five different ways, so a counted string cannot be one
// key with an interpolated number — i18next resolves the CLDR suffix instead.
const COUNTED_KEYS = ['styles_count'];
const EN_PLURALS = ['one', 'other'];
const AR_PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'];

describe('AI image modal locale coverage', () => {
  it.each(KEYS)('has %s in English', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
  });

  it.each(KEYS)('has %s in Arabic', (key) => {
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
  });

  it.each(COUNTED_KEYS)('has every English plural form of %s', (key) => {
    for (const form of EN_PLURALS) {
      expect(typeof en[`${key}_${form}`]).toBe('string');
    }
  });

  it.each(COUNTED_KEYS)('has every Arabic plural form of %s', (key) => {
    for (const form of AR_PLURALS) {
      expect(typeof ar[`${key}_${form}`]).toBe('string');
    }
  });
});

describe('AI image modal Arabic quality', () => {
  const arabicScript = /[؀-ۿ]/;

  // The failure this guards is a silent one: an English string pasted into the
  // Arabic file reads as "translated" to anything but a reader.
  it.each([
    ...IMAGE_STYLE_IDS.map((id) => `image_style_${id}`),
    ...IMAGE_STYLE_CATEGORIES.map((id) => `image_style_cat_${id}`),
  ])('writes %s in Arabic script', (key) => {
    expect(ar[key]).toMatch(arabicScript);
  });

  // FR-002: the tooltip names the exact pixel output, and it gets it by
  // interpolating the preset rather than restating the numbers by hand, so the
  // copy cannot drift from what the renderer is actually asked for.
  it.each(IMAGE_ASPECT_IDS)(
    'interpolates the render size into both %s tooltips',
    (id) => {
      expect(en[`image_aspect_${id}_tooltip`]).toContain('{{size}}');
      expect(ar[`image_aspect_${id}_tooltip`]).toContain('{{size}}');
    }
  );

  // Latin runs inside Arabic sentences reorder without an explicit direction.
  it('wraps the Latin runs in the Arabic tooltips with dir="ltr"', () => {
    for (const id of IMAGE_ASPECT_IDS) {
      expect(ar[`image_aspect_${id}_tooltip`]).toContain('dir="ltr"');
    }
  });
});
