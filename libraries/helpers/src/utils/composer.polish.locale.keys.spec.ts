// Guards the words of spec 062 (composer and Studio polish): the new keys exist in en and ar with
// the same {{var}} placeholders, and the Arabic mistakes found are gone. Like the Studio guards,
// the new keys live in en and ar only, so only those two are read.
import * as fs from 'fs';
import * as path from 'path';
import { FACEBOOK_PRESETS } from '../../../nestjs-libraries/src/dtos/posts/providers-settings/facebook.dto';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);
const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;
const en = readLocale('en');
const ar = readLocale('ar');

const PLURALS_EN = ['one', 'other'];
const PLURALS_AR = ['zero', 'one', 'two', 'few', 'many', 'other'];
const withPlurals = (key: string, forms: string[]) =>
  forms.map((form) => `${key}_${form}`);

const PLAIN_KEYS = [
  ...FACEBOOK_PRESETS.map((preset) => `facebook_preset_${preset.id}`),
  'instagram_tags_label',
  'assistant_open_chat',
  'assistant_close_chat',
  'veo3_reference_skipped',
  'preview_linkedin_comment',
];
const PLURAL_KEYS = [
  'facebook_preview_time_minutes',
  'facebook_preview_time_hours',
  'youtube_continue_subscribers',
];
const EN_KEYS = [
  ...PLAIN_KEYS,
  ...PLURAL_KEYS.flatMap((key) => withPlurals(key, PLURALS_EN)),
];
const AR_KEYS = [
  ...PLAIN_KEYS,
  ...PLURAL_KEYS.flatMap((key) => withPlurals(key, PLURALS_AR)),
];

const placeholders = (value: string) =>
  Array.from(value.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1])
    .sort()
    .join(',');
const TATWEEL = 'ـ';
// Every Arabic mark (tashkeel and the dagger alif) except tanween fath.
const NON_FATH_MARK = /[ؐ-ٌؚ-ٰٟۖ-ۭ]/;

describe('spec 062 words', () => {
  it('the Facebook presets are the 74 the DTO lists', () => {
    expect(FACEBOOK_PRESETS).toHaveLength(74);
  });

  it.each(EN_KEYS)('en has %s', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
  });

  it.each(AR_KEYS)('ar has %s', (key) => {
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
  });

  it('the Facebook preset names in en are the DTO names verbatim', () => {
    FACEBOOK_PRESETS.forEach((preset) => {
      expect(en[`facebook_preset_${preset.id}`]).toBe(preset.name);
    });
  });

  it('the counted Arabic forms keep the count placeholder', () => {
    PLURAL_KEYS.forEach((key) => {
      withPlurals(key, ['few', 'many', 'other']).forEach((k) => {
        expect(placeholders(ar[k])).toBe(placeholders(en[`${key}_other`]));
      });
    });
    PLAIN_KEYS.forEach((key) => {
      expect(placeholders(ar[key])).toBe(placeholders(en[key]));
    });
  });

  it('no new Arabic string holds a mark other than tanween fath', () => {
    AR_KEYS.forEach((key) => {
      expect({ key, bad: NON_FATH_MARK.test(ar[key] ?? '') }).toEqual({
        key,
        bad: false,
      });
    });
  });

  describe('the Arabic corrections', () => {
    it('workspace_example_1 spells ليمونادة', () => {
      expect(ar.workspace_example_1).toContain('ليمونادة');
      expect(ar.workspace_example_1).not.toContain('ليموناضة');
    });

    it.each(['seconds', 'video_type_veo3_pill_length'])(
      '%s says ثوان, not ثواني',
      (key) => {
        expect(ar[key]).toContain('ثوان');
        expect(ar[key]).not.toContain('ثواني');
      }
    );

    it.each(['video'])('%s has no tatweel', (key) => {
      expect(ar[key]).not.toContain(TATWEEL);
      expect(ar[key]).toContain('{{ai}}');
    });

    it('label_x_community_url ends on the URL with no parenthesis after it', () => {
      expect(ar.label_x_community_url).not.toMatch(/[()]/);
      expect(ar.label_x_community_url).toMatch(/https:\/\/\S+$/);
    });

    it('no two facebook_preset_* share an Arabic name', () => {
      const names = FACEBOOK_PRESETS.map(
        (preset) => ar[`facebook_preset_${preset.id}`]
      );
      expect(new Set(names).size).toBe(names.length);
    });

    it('video_prompt_shortfall_many puts the tanween on the letter before the alef', () => {
      expect(ar.video_prompt_shortfall_many).toContain('حرفًا');
      expect(ar.video_prompt_shortfall_many).not.toContain('حرفاً');
    });
  });
});
