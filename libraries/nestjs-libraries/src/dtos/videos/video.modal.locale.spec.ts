// Every string the AI video modal shows has to exist in BOTH locales: a key
// that lives only as an inline English default renders English in the Arabic
// UI. The manifest below is deliberately exhaustive — derived keys for the
// orientation catalog, literal keys for everything else (FR-020).
// (feature 007-ai-video-modal-v2, T048.)
import * as fs from 'fs';
import * as path from 'path';
import { VIDEO_ORIENTATION_IDS } from './video.orientation.catalog';

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
  // Waiting and result screens (T022)
  'creating_your_video',
  'video_render_minutes',
  'video_elapsed',
  'close_window_video_note',
  'use_video',
  'edit_script',
  'edit_prompt',
  'regenerate',
  'one_credit',
  // Action bar cost statements (T029)
  'video_nothing_charged_yet',
  'video_uses_one_credit',
  // Prompt bounds (T034)
  'video_prompt_counter',
  'video_prompt_too_long',
  // Orientation (T039)
  'video_orientation',
  ...VIDEO_ORIENTATION_IDS.map((id) => `video_orientation_${id}`),
  ...VIDEO_ORIENTATION_IDS.map((id) => `video_orientation_${id}_tooltip`),
  // Type cards and the step trail (T044)
  'video_type_image_text_slides',
  'video_type_slides_desc',
  'video_type_slides_pill_slides',
  'video_type_slides_pill_length',
  'video_type_slides_pill_voiceover',
  'video_type_slides_pill_bestfor',
  'video_type_veo3',
  'video_type_veo3_desc',
  'video_type_veo3_pill_length',
  'video_type_veo3_pill_quality',
  'video_type_veo3_pill_refs',
  'video_type_veo3_pill_bestfor',
  'video_step_script',
  'video_step_review',
  'video_step_render',
];

// Arabic counts a noun six different ways, so a counted string cannot be one
// key with an interpolated number — i18next resolves the CLDR suffix instead.
const COUNTED_KEYS = [
  'video_prompt_min_hint',
  'video_prompt_shortfall',
  'voice_set_count',
];
const EN_PLURALS = ['one', 'other'];
const AR_PLURALS = ['zero', 'one', 'two', 'few', 'many', 'other'];

const placeholders = (value: string) =>
  (value.match(/{{\s*\w+\s*}}/g) || []).map((token) => token.replace(/\s/g, ''))
    .sort();

describe('AI video modal locale coverage', () => {
  it.each(KEYS)('has %s in English', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
  });

  it.each(KEYS)('has %s in Arabic', (key) => {
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
  });

  // An Arabic string that dropped a placeholder renders the sentence with a
  // hole in it; one that invented a placeholder renders the token itself.
  it.each(KEYS)('interpolates the same values in both locales for %s', (key) => {
    expect(placeholders(ar[key] || '')).toEqual(placeholders(en[key] || ''));
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

  // Only the plural form that actually names a number carries `{{count}}`:
  // Arabic writes one and two as words, which is the whole reason these keys
  // are pluralised rather than interpolated.
  it.each(COUNTED_KEYS)('interpolates the count in the other form of %s', (key) => {
    expect(en[`${key}_other`]).toContain('{{count}}');
    expect(ar[`${key}_other`]).toContain('{{count}}');
  });
});

describe('AI video modal Arabic quality', () => {
  const arabicScript = /[؀-ۿ]/;

  // The failure this guards is a silent one: an English string pasted into the
  // Arabic file reads as "translated" to anything but a reader. The two strings
  // that carry no words in any language are excluded by name.
  const LATIN_BY_CONVENTION = [
    // A product name and a resolution — both stay Latin inside Arabic copy by
    // the fork's own convention.
    'video_type_veo3',
    'video_type_veo3_pill_quality',
    // Two placeholders and a slash — there is nothing here to translate.
    'video_prompt_counter',
  ];

  it.each(KEYS.filter((key) => !LATIN_BY_CONVENTION.includes(key)))(
    'writes %s in Arabic script',
    (key) => {
      expect(ar[key]).toMatch(arabicScript);
    }
  );

  // Latin runs inside Arabic sentences reorder without an explicit direction.
  it.each(VIDEO_ORIENTATION_IDS)(
    'wraps the Latin runs in the Arabic %s tooltip with dir="ltr"',
    (id) => {
      expect(ar[`video_orientation_${id}_tooltip`]).toContain('dir="ltr"');
    }
  );
});
