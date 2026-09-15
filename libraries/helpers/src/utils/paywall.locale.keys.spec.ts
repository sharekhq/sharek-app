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

// The two screens 027 rewrote also carried brand text with no t() call at all,
// which neither the key-reference scan nor the locale sweep could see: the
// sweep worked from contracts/arabic-brand-split.md, i.e. over locale JSON, and
// a string with no key has nothing to sweep. Both rendered Latin "Sharek" on the
// Arabic page — one as visible footer text, one as an iframe's accessible name.
describe('brand text that reaches the reader without a translation key', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  const SOURCES = {
    authLayout: '../../../../apps/frontend/src/app/(app)/auth/layout.tsx',
    paywall:
      '../../../../apps/frontend/src/components/billing/first.billing.component.tsx',
  } as const;

  const read = (key: keyof typeof SOURCES) =>
    fs.readFileSync(path.join(__dirname, SOURCES[key]), 'utf8');

  it.each(['auth_copyright', 'billing_video_frame_title'])(
    'says %s in both languages',
    (key) => {
      expect(typeof en[key]).toBe('string');
      expect(en[key].length).toBeGreaterThan(0);
      expect(typeof ar[key]).toBe('string');
      expect(ar[key].length).toBeGreaterThan(0);
      expect(ar[key]).not.toBe(en[key]);
    }
  );

  // FR-007/FR-008: neither string is glued to an untranslated technical token
  // and neither is content the product publishes, so both take the Arabic brand.
  it.each(['auth_copyright', 'billing_video_frame_title'])(
    'carries the Arabic brand in %s, never the Latin one',
    (key) => {
      expect(ar[key]).toContain('شارك');
      expect(ar[key]).not.toContain('Sharek');
      expect(ar[key]).not.toContain('شارِك');
    }
  );

  // The footer sat two lines from the headline this feature replaced.
  it('renders the sign-in footer through t(), not as JSX text', () => {
    const source = read('authLayout');
    expect(source).not.toMatch(/^\s*©\s*\d{4}\s+Sharek\s*$/m);
    expect(source).toContain("t('auth_copyright'");
  });

  // An iframe's `title` is its accessible name, so a hardcoded one is announced
  // in English on the Arabic paywall while every visible string around it is
  // translated. Distinct from billing_video_modal_title, which is the dialog's
  // own heading — reusing that would have a screen reader say it twice.
  it('names the tutorial frame through t(), not as a literal attribute', () => {
    const source = read('paywall');
    expect(source).not.toContain('title="Sharek Tutorial"');
    expect(source).toMatch(/title=\{t\(\s*'billing_video_frame_title'/);
  });
});

// Two more strings the paywall header renders that the brand sweep could not
// reach: one built by concatenation in the component, one carrying a diacritic
// the house style does not use. Both surfaced measuring the deployed header.
describe('paywall header strings the brand sweep could not reach', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );
  const en = locales.en;
  const ar = locales.ar;
  const logoutSource = fs.readFileSync(
    path.join(__dirname, '../../../../apps/frontend/src/components/layout/logout.component.tsx'),
    'utf8'
  );

  // The tooltip read "تسجيل الخروج من Sharek": a translated prefix with the
  // Latin brand glued on by the component, from a ternary whose two branches
  // were the same string. One key carries the whole sentence instead, so no
  // language is left assembling it — the glue is what CLAUDE.local.md warns
  // about for Arabic in the first place.
  it('says the whole logout sentence in one key', () => {
    expect(typeof en.logout_from_sharek).toBe('string');
    expect(en.logout_from_sharek).toContain('Sharek');
    expect(ar.logout_from_sharek).toContain('شارك');
    expect(ar.logout_from_sharek).not.toContain('Sharek');
  });

  // Both replaced a string the six upstream locales already translated, or sat
  // beside one they did — `logout_from` was translated in all six, so shipping
  // its replacement in en and ar alone would have dropped six languages back to
  // the English default, and `billing_video_modal_title` is in all eight, so its
  // sibling belongs there too. This is the assertion that catches that.
  it.each(
    languages.flatMap((lng) =>
      ['logout_from_sharek', 'billing_video_frame_title'].map((key) => [lng, key])
    )
  )('has a non-empty %s translation for %s', (lng, key) => {
    expect(typeof locales[lng][key]).toBe('string');
    expect(locales[lng][key].length).toBeGreaterThan(0);
  });

  // auth_copyright is deliberately NOT in the other six: "© 2026 Sharek" is
  // the same in every Latin-script locale and in ru, so the inline default is
  // already right there, and six identical copies would only be merge surface.
  it('leaves auth_copyright to en and ar, where the script differs', () => {
    expect(en.auth_copyright).toBeDefined();
    expect(ar.auth_copyright).toBeDefined();
    for (const lng of languages.filter((l) => l !== 'en' && l !== 'ar')) {
      expect(locales[lng]).not.toHaveProperty('auth_copyright');
    }
  });

  it('no longer builds the sentence from a ternary with identical branches', () => {
    expect(logoutSource).not.toMatch(/isGeneral\s*\?\s*' Sharek'\s*:\s*' Sharek'/);
    expect(logoutSource).toContain('logout_from_sharek');
  });

  // Left behind by the replacement, and referenced by nothing else.
  it('has dropped the orphaned logout_from from en and ar', () => {
    expect(en).not.toHaveProperty('logout_from');
    expect(ar).not.toHaveProperty('logout_from');
  });

  // House style is tanween fath (U+064B) and nothing else. The 221-diacritic
  // backlog was scoped to screens 027 does not touch; T022 kept this tooltip,
  // so it belongs here.
  it.each(['developer', 'logout_from_sharek'])(
    'carries no diacritic but tanween fath in ar.%s',
    (key) => {
      const stray = [...ar[key]].filter((c) =>
        'ٌٍَُِّْـ'.includes(c)
      );
      expect(stray).toEqual([]);
    }
  );
});
