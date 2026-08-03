// Guards the media page's new strings (en + ar). A key that exists only as an
// inline t() default renders English in every other language, which is how the
// fork's "half-translated Arabic" bug happened — and the duplicate-key spec
// does not catch it, because it never compares one locale against another.
// (feature 008-media-page-polish.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

describe('media page locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each([
    'open_original',
    'open_preview',
    'are_you_sure_you_want_to_delete_this_file',
  ])(
    'has a non-empty English and Arabic %s',
    (key) => {
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
      expect(typeof ar[key]).toBe('string');
      expect(ar[key].length).toBeGreaterThan(0);
    }
  );

  it('keeps the {{name}} placeholder in the delete label, in both locales', () => {
    expect(en.delete_media_named).toContain('{{name}}');
    expect(ar.delete_media_named).toContain('{{name}}');
  });

  it('translates the Arabic strings rather than echoing the English', () => {
    for (const key of [
      'open_original',
      'open_preview',
      'are_you_sure_you_want_to_delete_this_file',
      'delete_media_named',
    ]) {
      expect(ar[key]).not.toBe(en[key]);
    }
  });
});
