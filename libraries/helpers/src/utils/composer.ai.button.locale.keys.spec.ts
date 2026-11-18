// Guards the words of spec 064 (one AI button in the composer): the two new keys exist in en and ar
// with the same {{var}} placeholders (none) and the exact strings, and the Arabic holds no mark
// other than tanween fath. Like the other guards, the new keys live in en and ar only.
import * as fs from 'fs';
import * as path from 'path';

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

const WORDS: Record<string, { en: string; ar: string }> = {
  create_with_ai: {
    en: 'Create with AI',
    ar: 'إنشاء بالذكاء الاصطناعي',
  },
  composer_ai_creating: { en: 'Creating…', ar: 'قيد الإنشاء…' },
};
const KEYS = Object.keys(WORDS);

const placeholders = (value: string) =>
  Array.from(value.matchAll(/\{\{\s*(\w+)\s*\}\}/g), (m) => m[1])
    .sort()
    .join(',');
// Every Arabic mark (tashkeel and the dagger alif) except tanween fath.
const NON_FATH_MARK = /[ؐ-ٌؚ-ٰٟۖ-ۭ]/;

describe('spec 064 words', () => {
  it.each(KEYS)('en has %s with the exact string', (key) => {
    expect(en[key]).toBe(WORDS[key].en);
  });

  it.each(KEYS)('ar has %s with the exact string', (key) => {
    expect(ar[key]).toBe(WORDS[key].ar);
  });

  it('both keys have no {{var}} in either language', () => {
    KEYS.forEach((key) => {
      expect(placeholders(en[key] ?? '')).toBe('');
      expect(placeholders(ar[key] ?? '')).toBe('');
    });
  });

  it('no new Arabic string holds a mark other than tanween fath', () => {
    KEYS.forEach((key) => {
      expect({ key, bad: NON_FATH_MARK.test(ar[key] ?? '') }).toEqual({
        key,
        bad: false,
      });
    });
  });
});
