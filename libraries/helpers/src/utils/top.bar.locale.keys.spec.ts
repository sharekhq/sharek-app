// Guards the top bar's words (spec 055, increment 2). The dark mode button is
// named by what a press will do, in two new keys every offered language
// carries, because the top bar shows in every language and keys in en and ar
// alone would leave the six others reading English (plan.md decision 7). The en
// and ar wording is data-model §6's top-bar table. The language button and the
// bell are named by change_language and notifications, which all eight carry
// already.
import * as fs from 'fs';
import * as path from 'path';
import { languages } from '@gitroom/react/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const MODE_COMPONENT = path.join(
  __dirname,
  '../../../../apps/frontend/src/components/layout/mode.component.tsx'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

// [key, en, ar]
const STRINGS = [
  ['switch_to_light_mode', 'Switch to light mode', 'التبديل إلى الوضع الفاتح'],
  ['switch_to_dark_mode', 'Switch to dark mode', 'التبديل إلى الوضع الداكن'],
] as const;

// The language button's and the bell's names, reused as they are.
const REUSED = ['change_language', 'notifications'] as const;

const OTHERS = languages.filter((lng) => lng !== 'en' && lng !== 'ar');

describe('top bar locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(
    languages.flatMap((lng) =>
      [...STRINGS.map(([key]) => key), ...REUSED].map((key) => [lng, key])
    )
  )('has %s.%s', (lng, key) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
  });

  it.each(STRINGS)('reads %s as "%s" in en and "%s" in ar', (key, en, ar) => {
    expect(locales.en[key]).toBe(en);
    expect(locales.ar[key]).toBe(ar);
  });

  // Identical bytes to the English means it was copied across rather than
  // translated, which reads as done and is not.
  it.each(OTHERS.flatMap((lng) => STRINGS.map(([key, en]) => [lng, key, en])))(
    'translates %s.%s: it is not "%s"',
    (lng, key, en) => {
      expect(typeof locales[lng][key]).toBe('string');
      expect(locales[lng][key]).not.toBe(en);
    }
  );

  // A key no t() call reads is a string the app shows in English or not at all.
  describe('every new string the app renders', () => {
    const referenced = Array.from(
      fs
        .readFileSync(MODE_COMPONENT, 'utf8')
        .matchAll(
          /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*'([A-Za-z0-9_]+)'/g
        ),
      (match) => match[1]
    );

    it.each(STRINGS.map(([key]) => key))(
      'is read by a t() call in the dark mode button: %s',
      (key) => {
        expect(referenced).toContain(key);
      }
    );
  });
});
