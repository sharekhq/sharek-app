// Guards the words of Settings' grouped menu (spec 059, contracts/strings.md
// §1 Settings): the two group labels, the Log out row and the build line. The
// new keys are in en and ar only, as every fork feature's are; the six other
// languages show the English default until translated. The menu's name, its
// ten tab labels and the Lifetime line reuse keys the app already carries, and
// logout_from_sharek stays for Billing and the paywall beside the new log_out.
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const SETTINGS_MENU = path.join(
  __dirname,
  '../../../../apps/frontend/src/components/settings/settings.menu.tsx'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

// [key, en, ar]
const STRINGS = [
  ['settings_group_posting', 'Posting', 'النشر'],
  ['settings_group_connections', 'Connections', 'الربط'],
  ['settings_version', 'Version {{version}}', 'الإصدار {{version}}'],
  ['log_out', 'Log out', 'تسجيل الخروج'],
] as const;

// Reused as they are: the menu's name, the ten tab labels and the Lifetime
// line.
const REUSED = [
  'settings',
  'global_settings',
  'teams',
  'auto_post',
  'sets',
  'signatures',
  'developers',
  'webhooks_1',
  'plugs',
  'apps',
  'integrations',
  'lifetime_tier',
] as const;

const placeholders = (text: string) =>
  (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('Settings menu locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each(STRINGS)(
    'reads %s as "%s" in en and "%s" in ar',
    (key, enText, arText) => {
      expect(en[key]).toBe(enText);
      expect(ar[key]).toBe(arText);
    }
  );

  // Identical bytes in both locales means the English was copied across rather
  // than translated, which reads as done and is not.
  it.each(STRINGS.map(([key]) => key))(
    'translates %s: its Arabic is not its English',
    (key) => {
      expect(typeof ar[key]).toBe('string');
      expect(ar[key]).not.toBe(en[key]);
    }
  );

  it.each(STRINGS)('keeps the placeholders of %s in ar', (key, enText) => {
    expect(typeof ar[key]).toBe('string');
    expect(placeholders(ar[key])).toEqual(placeholders(enText));
  });

  it.each(STRINGS.map(([key]) => key))(
    '%s carries no mark but tanween fath',
    (key) => {
      expect(typeof ar[key]).toBe('string');
      expect(ar[key]).not.toMatch(/[ٌ-ْ]/);
    }
  );

  it.each(REUSED)('carries the reused %s in en and ar', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(typeof ar[key]).toBe('string');
  });

  it('keeps logout_from_sharek for Billing and the paywall', () => {
    expect(en.logout_from_sharek).toBe('Logout from Sharek');
    expect(ar.logout_from_sharek).toBe('تسجيل الخروج من شارك');
  });

  // A key no t() call reads is a string the app shows in English or not at all.
  describe('every new string the menu renders', () => {
    const referenced = Array.from(
      fs
        .readFileSync(SETTINGS_MENU, 'utf8')
        .matchAll(
          /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*'([A-Za-z0-9_]+)'/g
        ),
      (match) => match[1]
    );

    it.each(STRINGS.map(([key]) => key))(
      'is read by a t() call in the Settings menu: %s',
      (key) => {
        expect(referenced).toContain(key);
      }
    );
  });
});
