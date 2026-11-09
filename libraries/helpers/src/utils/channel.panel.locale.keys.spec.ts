// Guards the strings of the shared channel list and the calendar's top bar
// (spec 051, increment 2). The en and ar wording is the contracts'
// (contracts/channel-panel.md, and contracts/pages-ui.md's calendar table) and
// the chip label's from tasks.md's C3, and every offered language carries each
// key, because keys in en and ar alone would drop the other six to English.
// previous_month, next_month and channel_list_with_count exist in en and ar
// already, for the date picker and today's chip, so they gain the six others.
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
  ['show_all', 'Show all', 'عرض الكل'],
  ['search_channels', 'Search channels', 'ابحث في القنوات'],
  ['no_channel_matches', 'No channel matches', 'لا توجد قناة مطابقة'],
  ['add_a_channel', 'Add a channel', 'إضافة قناة'],
  [
    'add_channel_hint',
    'Connect an account you can log in to',
    'اربط حسابًا تملك بيانات دخوله',
  ],
  ['invite_a_customer', 'Invite a customer', 'دعوة عميل'],
  [
    'invite_a_customer_hint',
    'Copies a link they open to connect their own account. It works for 1 hour.',
    'ينسخ رابطًا يفتحه العميل ليربط حسابه بنفسه، ويبقى صالحًا لمدة ساعة.',
  ],
  ['expand', 'Expand', 'توسيع'],
  ['channel_menu', 'Channel menu', 'قائمة القناة'],
  [
    'channel_hint_calendar',
    'Untick a channel to hide its posts.',
    'أزل العلامة عن قناة لإخفاء منشوراتها.',
  ],
  ['channel_disconnected', 'Disconnected', 'انقطع الاتصال'],
  ['reconnect', 'Reconnect', 'إعادة الربط'],
  ['channel_needs_setup', 'Needs setup', 'تحتاج إلى إعداد'],
  ['finish_setup', 'Finish setup', 'إكمال الإعداد'],
  [
    'channel_disabled_over_plan',
    'Disabled · over your plan',
    'معطلة · تجاوزت حد خطتك',
  ],
  ['previous_week', 'Previous week', 'الأسبوع السابق'],
  ['next_week', 'Next week', 'الأسبوع التالي'],
  ['previous_day', 'Previous day', 'اليوم السابق'],
  ['next_day', 'Next day', 'اليوم التالي'],
  ['view_named', 'View: {{view}}', 'العرض: {{view}}'],
  ['previous_month', 'Previous month', 'الشهر السابق'],
  ['next_month', 'Next month', 'الشهر التالي'],
  // The lifetime-tier line, moved from the channel list to Settings (R11). The
  // plan's name in {{tier}} stays as the product names it.
  ['lifetime_tier', '{{tier}} tier', 'خطة {{tier}}'],
  // The phone's short day is a dayjs format each language words its own way:
  // the canvas gives "Wed, 11 Nov" in English and "11 نوفمبر" in Arabic.
  ['calendar_short_day_format', 'ddd, D MMM', 'D MMM'],
  // Two calendar strings older than the spec that walk 2 found in English: the
  // post menus' name, in en and ar alone, and a past cell's hover hint, which
  // global.scss drew as a literal.
  ['post_actions', 'Post actions', 'إجراءات المنشور'],
  ['date_passed', 'Date passed', 'مضى التاريخ'],
  // The post card's status chips (calendar.post.card.tsx), in en and ar alone
  // since July, and Draft's, the shared draft key.
  ['calendar_state_published', 'Published', 'تم النشر'],
  ['calendar_state_scheduled', 'Scheduled', 'مجدول'],
  ['calendar_state_failed', 'Failed', 'فشل'],
  ['draft', 'Draft', 'مسودة'],
  // The List view's state segments (filters.tsx), Draft's beside them; in en
  // and ar alone until walk 2.
  ['all', 'All', 'الكل'],
  ['scheduled', 'Scheduled', 'مجدول'],
  ['published', 'Published', 'منشور'],
  // The List view's pager (filters.tsx), "Page 1 of 1"; in en and ar alone
  // until the 205 re-walk.
  ['page', 'Page', 'الصفحة'],
  ['of', 'of', 'من'],
] as const;

// The status chips and the List view's segments describe a post, which es, fr
// and pt name with a feminine noun (publicación, publication, postagem), so
// their words agree with it. Failed is a noun in fr and pt (Échec, Falha) and
// agrees with nothing. ru keeps the neuter short form, the impersonal one a
// Russian status label takes (a sent message's Отправлено), not the masculine
// of пост.
const AGREEING = [
  ['es', 'calendar_state_published', 'Publicada'],
  ['es', 'calendar_state_scheduled', 'Programada'],
  ['es', 'calendar_state_failed', 'Fallida'],
  ['es', 'all', 'Todas'],
  ['es', 'scheduled', 'Programada'],
  ['es', 'published', 'Publicada'],
  ['fr', 'calendar_state_published', 'Publiée'],
  ['fr', 'calendar_state_scheduled', 'Planifiée'],
  ['fr', 'all', 'Toutes'],
  ['fr', 'scheduled', 'Planifiée'],
  ['fr', 'published', 'Publiée'],
  ['pt', 'calendar_state_published', 'Publicada'],
  ['pt', 'calendar_state_scheduled', 'Agendada'],
  ['pt', 'all', 'Todas'],
  ['pt', 'scheduled', 'Agendada'],
  ['pt', 'published', 'Publicada'],
  ['ru', 'calendar_state_published', 'Опубликовано'],
  ['ru', 'calendar_state_scheduled', 'Запланировано'],
  ['ru', 'scheduled', 'Запланировано'],
  ['ru', 'published', 'Опубликовано'],
] as const;

// C3 keeps today's chip label while nothing is hidden. No document gives its
// Arabic, so only the English is pinned.
const CHIP_COUNT = ['channel_list_with_count', 'Channels: {{count}}'] as const;

// Counts, plural on the total: [key, en by form, ar in every form].
const PLURALS = [
  [
    'channels_shown_of_total',
    { one: '{{shown}} of 1 channel', other: '{{shown}} of {{count}} channels' },
    'القنوات الظاهرة: {{shown}} من {{count}}',
  ],
  [
    'channels_chip_label',
    {
      one: 'Channels: {{shown}} of 1 shown',
      other: 'Channels: {{shown}} of {{count}} shown',
    },
    'القنوات الظاهرة: {{shown}} من {{count}}',
  ],
] as const;

// i18next 25 reads <key>_<category>, the category Intl.PluralRules picks for
// the count (and <key>_zero first when the count is 0), so a language missing
// one of its forms renders that count in English.
const forms = (lng: string) =>
  new Intl.PluralRules(lng).resolvedOptions().pluralCategories;

const placeholders = (text: string) =>
  (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('channel panel locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(
    languages.flatMap((lng) =>
      [...STRINGS, CHIP_COUNT].map(([key, en]) => [lng, key, en])
    )
  )('has %s.%s, keeping the placeholders of "%s"', (lng, key, en) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
    expect(placeholders(locales[lng][key])).toEqual(placeholders(en));
  });

  // en's _one says 1 where _other says {{count}}, as the documents word it.
  // Every other language keeps both in every form: Russian's _one also reads 21
  // and 31, and French and Portuguese's also reads 0.
  it.each(
    languages.flatMap((lng) =>
      PLURALS.flatMap(([key, en]) =>
        forms(lng).map((form) => [
          lng,
          key,
          form,
          lng === 'en'
            ? placeholders(en[form as keyof typeof en])
            : ['{{count}}', '{{shown}}'],
        ])
      )
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

  it.each(AGREEING)(
    'reads %s.%s as "%s", agreeing with a post',
    (lng, key, word) => {
      expect(locales[lng][key]).toBe(word);
    }
  );

  it('reads channel_list_with_count as C3 gives it in en, translated in ar', () => {
    const [key, en] = CHIP_COUNT;
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
        expect(locales.ar[`${key}_${form}`]).toBe(ar);
      }
    }
  );

  // select_channels_filtered was Sharek's own label for the calendar's channel
  // filter, which the panel replaces, so it leaves en and ar, the only files
  // that carried it (C4).
  it.each(['en', 'ar'])('has no select_channels_filtered in %s', (lng) => {
    expect(locales[lng]).not.toHaveProperty('select_channels_filtered');
  });
});
