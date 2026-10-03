// Guards the AI image window's strings (en + ar). A key that exists only as an
// inline t() default renders English in every other language, and the
// duplicate-key spec cannot see it because it never compares one locale
// against another. (feature 031-ai-image-references-edit; each increment adds
// its keys to the list.)
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

const placeholders = (text: string) => text.match(/{{\w+}}/g) ?? [];

describe('AI image window locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each([
    // Increment 1: the stream ended before its last frame (FR-025).
    'image_connection_dropped',
    // Increment 2: the reference row and the refusals that name a reference
    // by its number (US1).
    'image_reference_hint',
    'image_reference_add',
    'image_reference_number',
    'image_reference_remove',
    'image_reference_missing',
    'image_reference_unreadable',
    'image_reference_too_large',
  ])('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    // Identical bytes in both locales means the English was copied across
    // rather than translated, which reads as done and is not.
    expect(ar[key]).not.toBe(en[key]);
    // A translation that drops a placeholder renders the sentence without its
    // value, and nothing fails loudly.
    for (const placeholder of placeholders(en[key])) {
      expect(ar[key]).toContain(placeholder);
    }
  });

  // The Media library's limit names a count, and Arabic agrees a counted noun
  // with its number in six CLDR forms where English has two. Each Arabic form
  // carries the count wherever the English form it stands for does: one for
  // one; few, many and other for other. Zero and two are said in words.
  describe('media_selection_limit, a plural set', () => {
    const ENGLISH_FORM: Record<string, 'one' | 'other' | null> = {
      zero: null,
      one: 'one',
      two: null,
      few: 'other',
      many: 'other',
      other: 'other',
    };

    it.each(['one', 'other'])('has the English %s form', (form) => {
      expect(typeof en[`media_selection_limit_${form}`]).toBe('string');
      expect(en[`media_selection_limit_${form}`].length).toBeGreaterThan(0);
    });

    it.each(Object.entries(ENGLISH_FORM))(
      'has the Arabic %s form',
      (form, english) => {
        const arabic = ar[`media_selection_limit_${form}`];
        expect(typeof arabic).toBe('string');
        expect(arabic.length).toBeGreaterThan(0);
        if (english) {
          for (const placeholder of placeholders(
            en[`media_selection_limit_${english}`]
          )) {
            expect(arabic).toContain(placeholder);
          }
        }
      }
    );
  });
});
