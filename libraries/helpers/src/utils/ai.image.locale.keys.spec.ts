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
});
