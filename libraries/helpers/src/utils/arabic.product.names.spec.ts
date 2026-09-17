// Feature 028-arabic-language-audit (C2).
// Guards against a product being spelled one way as a label and another inside a
// sentence — the defect where the channel list says إكس and the empty state beside it
// says X, so the reader cannot tell they are the same product. It runs in both
// directions, because each has its own failure: an Arabic-labelled product written in
// Latin inside Arabic prose, and a product whose own community writes it in Latin
// being transliterated into an Arabic nobody uses.
//
// The platform_* labels are the source of truth for which spelling is correct, and
// KEEP_LATIN_PRODUCTS for which products are exempt (arabic-policy.ts) — so the check
// has no list of its own to drift out of date.
//
// Deliberately not asserted: how a Latin name renders at the end of an Arabic
// sentence. That is a bidi property of the paragraph, not of the spelling; asserting
// it here would mean reimplementing the bidi algorithm and then testing the
// reimplementation. It is verified visually instead (quickstart, FR-020).
import * as fs from 'fs';
import * as path from 'path';
import { KEEP_LATIN_PRODUCTS } from '@gitroom/react/translation/arabic-policy';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string): Record<string, unknown> =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const en = readLocale('en');
const ar = readLocale('ar');

const PLATFORM_KEYS = Object.keys(en).filter((key) =>
  key.startsWith('platform_')
);

const hasArabicLetters = (value: string) => /[ء-ي]/.test(value);

const labelOf = (locale: Record<string, unknown>, key: string) =>
  String(locale[key] ?? '');

// Products the app names in Arabic. Their Latin name is what must not appear.
const ARABIC_LABELLED = PLATFORM_KEYS.filter((key) =>
  hasArabicLetters(labelOf(ar, key))
);

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A standalone Latin run, case-sensitive: x.com is not X, and YouTubeShorts is not
// YouTube. Arabic letters are not word characters here, so TikTok glued to an Arabic
// particle still matches — which is the common shape (وTikTok).
const standalone = (name: string) =>
  new RegExp(`(?<![A-Za-z0-9])${escapeForRegExp(name)}(?![A-Za-z0-9])`);

interface Offence {
  key: string;
  product: string;
  found: string;
  expected: string;
}

const latinInsideArabic = (): Offence[] =>
  ARABIC_LABELLED.flatMap((platformKey) => {
    const latin = labelOf(en, platformKey);
    const arabic = labelOf(ar, platformKey);
    const pattern = standalone(latin);
    return Object.entries(ar)
      .filter(
        ([key, value]) =>
          // The labels themselves are the source of truth, not a violation: gmb's
          // Arabic label names Google on purpose.
          !key.startsWith('platform_') &&
          typeof value === 'string' &&
          pattern.test(value)
      )
      .map(([key]) => ({
        key,
        product: platformKey,
        found: latin,
        expected: arabic,
      }));
  });

describe('Arabic product names', () => {
  it('never writes an Arabic-labelled product in Latin inside an Arabic string', () => {
    expect(latinInsideArabic()).toEqual([]);
  });

  // The other direction, as one assertion rather than twelve: the products left in
  // Latin must be exactly the ones the policy exempts. It fails if a keep-Latin
  // product is transliterated into an Arabic its own community does not use, and
  // equally if a product that should read in Arabic was left in Latin — the second
  // being how this defect got here.
  it('leaves exactly the keep-Latin products in Latin', () => {
    const latinLabelled = PLATFORM_KEYS.filter(
      (key) => !hasArabicLetters(labelOf(ar, key))
    )
      .map((key) => labelOf(en, key))
      .sort();
    expect(latinLabelled).toEqual([...KEEP_LATIN_PRODUCTS].sort());
  });

  // Guards the guard: if the labels stopped being readable the scan above would find
  // nothing to compare and pass in silence.
  it('reads platform labels in both locales', () => {
    expect(PLATFORM_KEYS.length).toBeGreaterThan(20);
    const unlabelled = PLATFORM_KEYS.filter(
      (key) => !labelOf(en, key).trim() || !labelOf(ar, key).trim()
    );
    expect(unlabelled).toEqual([]);
  });
});
