// Guards the language-selector catalog (i18n.config.ts) against drift: the exact
// curated set and order, the exact native display names, the delisted codes, an
// on-disk locale for every listed code, and the modal-title copy.
// (feature 004-brand-ui-refresh, US2 — curated, properly presented language list.)
import * as fs from 'fs';
import * as path from 'path';
import {
  languages,
  languageNames,
} from '../../../react-shared-libraries/src/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const EXPECTED = ['en', 'ar', 'de', 'fr', 'es', 'it', 'pt', 'ru'];
const EXPECTED_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
};
const DELISTED = ['vi', 'tr', 'ko', 'ja', 'zh', 'he'];

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

describe('language catalog (i18n.config)', () => {
  it('lists exactly the 8 curated languages in order', () => {
    expect(languages).toEqual(EXPECTED);
  });

  it('excludes every delisted language code', () => {
    for (const code of DELISTED) {
      expect(languages).not.toContain(code);
    }
  });

  it('maps every listed code to its exact native name (and nothing else)', () => {
    expect(languageNames).toEqual(EXPECTED_NAMES);
  });

  it('has a locale directory on disk for every listed code', () => {
    for (const code of languages) {
      expect(
        fs.existsSync(path.join(LOCALES_DIR, code, 'translation.json'))
      ).toBe(true);
    }
  });

  it('titles the selector modal "Select Language" / "اختر اللغة"', () => {
    expect(readLocale('en').change_language).toBe('Select Language');
    expect(readLocale('ar').change_language).toBe('اختر اللغة');
  });
});
