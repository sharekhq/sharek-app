// Guards the strings of the Analytics page (spec 051, increment 4): the top
// bar's period control, the charts' headline lines and empty state, the phone's
// channel button, and the channel list's analytics hint and row reason. The en
// and ar wording is the contracts' (contracts/pages-ui.md's Analytics table, and
// contracts/channel-panel.md for the hint and the reason), and every offered
// language carries each key, because keys in en and ar alone would drop the
// other six to English. Each period has its own keys, so nothing is counted.
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
  ['period', 'Period', 'الفترة'],
  ['last_7_days', 'Last 7 days', 'آخر 7 أيام'],
  ['last_30_days', 'Last 30 days', 'آخر 30 يومًا'],
  ['last_90_days', 'Last 90 days', 'آخر 90 يومًا'],
  ['total_last_7_days', 'Total for the last 7 days', 'المجموع خلال آخر 7 أيام'],
  [
    'total_last_30_days',
    'Total for the last 30 days',
    'المجموع خلال آخر 30 يومًا',
  ],
  [
    'total_last_90_days',
    'Total for the last 90 days',
    'المجموع خلال آخر 90 يومًا',
  ],
  [
    'average_last_7_days',
    'Average for the last 7 days',
    'المتوسط خلال آخر 7 أيام',
  ],
  [
    'average_last_30_days',
    'Average for the last 30 days',
    'المتوسط خلال آخر 30 يومًا',
  ],
  [
    'average_last_90_days',
    'Average for the last 90 days',
    'المتوسط خلال آخر 90 يومًا',
  ],
  [
    'change_channel_named',
    'Channel: {{name}} on {{platform}}. Change channel',
    'القناة: {{name}} على {{platform}}. تغيير القناة',
  ],
  [
    'no_data_for_period',
    'No data for this period',
    'لا توجد بيانات لهذه الفترة',
  ],
  [
    'channel_hint_analytics',
    'Pick a channel to see its numbers.',
    'اختر قناة لعرض أرقامها.',
  ],
  [
    'no_statistics_for_platform',
    'No statistics for this platform',
    'لا تتوفر أرقام لهذه المنصة',
  ],
] as const;

const placeholders = (text: string) =>
  (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('Analytics panel locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(
    languages.flatMap((lng) => STRINGS.map(([key, en]) => [lng, key, en]))
  )('has %s.%s, keeping the placeholders of "%s"', (lng, key, en) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
    expect(placeholders(locales[lng][key])).toEqual(placeholders(en));
  });

  it.each(STRINGS)('reads %s as "%s" in en and "%s" in ar', (key, en, ar) => {
    expect(locales.en[key]).toBe(en);
    expect(locales.ar[key]).toBe(ar);
  });
});
