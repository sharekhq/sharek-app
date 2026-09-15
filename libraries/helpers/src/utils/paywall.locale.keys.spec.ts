// Guards the paywall and sign-in strings (feature 027-paywall-copy-arabic-logo):
// the two headlines and every entry the FAQ list renders. A key that exists only as an inline t() default
// renders English in every other language, which is how the fork's
// "half-translated Arabic" bug happened — and unlike the media page's three
// strings, these six ship to all eight reachable languages, so the check is run
// against `languages` rather than en/ar alone.
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

const KEYS = [
  'billing_headline_lead',
  'billing_headline_highlight',
  'billing_video_link',
  'billing_video_modal_title',
  'auth_headline_lead',
  'auth_headline_highlight',
  'billing_channels_label',
  'billing_channels_more',
  'billing_capability_line',
];

// Every key faq.component's list reads. The delete-account pair is here because
// it existed only in en and ar, so six languages read the sixth answer in English
// while the other five were translated — the gap this guard exists to catch.
const FAQ_KEYS = [
  'faq_am_i_going_to_be_charged_by_postiz',
  'faq_to_confirm_credit_card_information_postiz_will_hold',
  'faq_who_is_samy',
  'faq_who_is_samy_answer',
  'faq_images_and_video',
  'faq_images_and_video_answer',
  'faq_which_channels',
  'faq_which_channels_answer',
  'faq_team_and_clients',
  'faq_team_and_clients_answer',
  'faq_how_can_i_delete_my_account',
  'faq_delete_account_description',
  'frequently_asked_questions',
];

// The four fragments the headline replaced. They stay in the six upstream-owned
// locales on purpose — editing those buys weekly merge conflicts and an
// unreferenced key renders nothing — so this only pins en and ar.
const RETIRED = [
  'billing_join_over',
  'billing_entrepreneurs_count',
  'billing_who_use',
  'billing_postiz_grow_social',
  'faq_can_i_trust_postiz_gitroom',
  'faq_postiz_gitroom_is_proudly_open_source',
  'faq_what_are_channels',
  'faq_postiz_gitroom_allows_you_to_schedule_posts',
  'faq_what_are_team_members',
  'faq_if_you_have_a_team_with_multiple_members',
];

describe('paywall and sign-in headline locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it.each(
    languages.flatMap((lng) => [...KEYS, ...FAQ_KEYS].map((key) => [lng, key]))
  )('has a non-empty %s translation for %s', (lng, key) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
  });

  // The remainder is interpolated, so a translation that drops the placeholder
  // renders the sentence without its number and nothing fails loudly.
  it.each(languages)('keeps the {{count}} placeholder in %s', (lng) => {
    expect(locales[lng].billing_channels_more).toContain('{{count}}');
  });

  it('translates the Arabic strings rather than echoing the English', () => {
    for (const key of [...KEYS, ...FAQ_KEYS]) {
      expect(locales.ar[key]).not.toBe(locales.en[key]);
    }
  });

  // The claim this feature exists to remove: a customer count nobody counted.
  it.each(RETIRED)('has dropped %s from en and ar', (key) => {
    expect(locales.en).not.toHaveProperty(key);
    expect(locales.ar).not.toHaveProperty(key);
  });
});
