// Guards the strings of Samy's page (spec 051, increment 3): the chats panel,
// the chat header and the message box's channel summary. The en and ar wording
// is the contracts' (contracts/pages-ui.md's Samy table, and
// contracts/channel-panel.md for the list's samy hint), and every offered
// language carries each key, because keys in en and ar alone would drop the
// other six to English. error_occurred exists in en and ar already, as
// activate.tsx's toast, and is the toast for a failed rename or pin (C4), so it
// gains the six others. The drawer's Close reuses close, which all eight carry.
import * as fs from 'fs';
import * as path from 'path';
import { languages } from '@gitroom/react/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

// [key, en, ar]
const STRINGS = [
  ['chats', 'Chats', 'المحادثات'],
  ['show_chats', 'Show chats', 'عرض المحادثات'],
  ['hide_chats', 'Hide chats', 'إخفاء المحادثات'],
  ['new_chat', 'New chat', 'محادثة جديدة'],
  ['search_chats', 'Search chats', 'ابحث في المحادثات'],
  ['no_chat_matches', 'No chat matches', 'لا توجد محادثة مطابقة'],
  ['chat_options', 'Chat options', 'خيارات المحادثة'],
  ['rename', 'Rename', 'إعادة تسمية'],
  ['pin_to_top', 'Pin to top', 'تثبيت في الأعلى'],
  ['unpin', 'Unpin', 'إلغاء التثبيت'],
  ['pinned_chats', 'Pinned', 'المثبتة'],
  ['chats_today', 'Today', 'اليوم'],
  ['chats_yesterday', 'Yesterday', 'أمس'],
  ['chats_previous_7_days', 'Previous 7 days', 'آخر 7 أيام'],
  ['chats_older', 'Older', 'أقدم'],
  ['samy_will_use', 'Samy will use', 'سيستخدم سامي'],
  ['no_channels_picked', 'No channels picked', 'لم تحدد أي قناة'],
  [
    'samy_will_use_label',
    'Samy will use {{names}}, {{channels}}. Change channels',
    'سيستخدم سامي {{names}}، {{channels}}. تغيير القنوات',
  ],
  [
    'channel_hint_samy',
    'Samy schedules to the channels you tick.',
    'يجدول سامي المنشورات على القنوات التي تحددها.',
  ],
] as const;

// C4 gives the toast's English. No document gives its Arabic, so ar's existing
// value is only held to a translation.
const TOAST = [
  'error_occurred',
  'An error occurred. Please try again.',
] as const;

// The summary's count, plural on the picks: [key, en by form, ar by form].
const PLURALS = [
  [
    'channels_count',
    { one: '1 channel', other: '{{count}} channels' },
    {
      zero: 'لا قنوات',
      one: 'قناة واحدة',
      two: 'قناتان',
      few: '{{count}} قنوات',
      many: '{{count}} قناة',
      other: '{{count}} قناة',
    },
  ],
] as const;

// i18next 25 reads <key>_<category>, the category Intl.PluralRules picks for
// the count (and <key>_zero first when the count is 0), so a language missing
// one of its forms renders that count in English.
const forms = (lng: string) =>
  new Intl.PluralRules(lng).resolvedOptions().pluralCategories;

const placeholders = (text: string) =>
  (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('Samy chats locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(
    languages.flatMap((lng) =>
      [...STRINGS, TOAST].map(([key, en]) => [lng, key, en])
    )
  )('has %s.%s, keeping the placeholders of "%s"', (lng, key, en) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
    expect(placeholders(locales[lng][key])).toEqual(placeholders(en));
  });

  // en's _one and ar's _zero, _one and _two say the number in words, as the
  // documents word them, where the other forms say {{count}}. Every other
  // language keeps {{count}} in every form: Russian's _one also reads 21 and
  // 31, and French and Portuguese's also reads 0.
  it.each(
    languages.flatMap((lng) =>
      PLURALS.flatMap(([key, en, ar]) => {
        const worded: Record<string, string> | undefined =
          lng === 'en' ? en : lng === 'ar' ? ar : undefined;
        return forms(lng).map((form) => [
          lng,
          key,
          form,
          worded ? placeholders(worded[form]) : ['{{count}}'],
        ]);
      })
    )
  )('has %s.%s_%s, keeping %j', (lng, key, form, kept) => {
    const text = locales[lng][`${key}_${form}`];
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
    expect(placeholders(text)).toEqual(kept);
  });

  it.each(STRINGS)('reads %s as "%s" in en and "%s" in ar', (key, en, ar) => {
    expect(locales.en[key]).toBe(en);
    expect(locales.ar[key]).toBe(ar);
  });

  it('reads error_occurred as C4 gives it in en, translated in ar', () => {
    const [key, en] = TOAST;
    expect(locales.en[key]).toBe(en);
    expect(typeof locales.ar[key]).toBe('string');
    expect(locales.ar[key]).not.toBe(en);
  });

  it.each(PLURALS)(
    'reads %s in en and ar as the documents word it',
    (key, en, ar) => {
      expect(locales.en[`${key}_one`]).toBe(en.one);
      expect(locales.en[`${key}_other`]).toBe(en.other);
      for (const form of forms('ar')) {
        expect(locales.ar[`${key}_${form}`]).toBe(ar[form as keyof typeof ar]);
      }
    }
  );
});
