// Feature 028-arabic-language-audit (C5).
// Guards the words the product settled on against drifting back. Five concepts were
// named one way in the app and another on sharek.app — plan, upgrade, analytics among
// them — and nothing watched, which is the same condition that let 156 strings
// accumulate vocalisation marks. The other checks in this feature would all stay green
// while the vocabulary drifted, because a retired word is correct Arabic; it is only
// the wrong word for this product.
//
// Matching is per word with attached particles stripped, never a substring test.
// مشاركة is a substring of مشاركات and رق of رقم, and a check that cries wolf on
// those teaches the reader to ignore it. Particle stripping has a floor for the same
// reason: فرق ("difference") is not ف + رق, so a stem under three letters is only
// ever matched whole.
import * as fs from 'fs';
import * as path from 'path';
import { RETIRED_TERMS } from '@gitroom/react/translation/arabic-policy';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const ar: Record<string, unknown> = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, 'ar', 'translation.json'), 'utf8')
);

// Arabic letters and the combining marks that sit on them. Anything else — spaces,
// punctuation, Latin, {{placeholders}}, markup — is a word boundary.
const ARABIC_WORD = /[ء-ْ]+/g;

// Prefixes Arabic writes joined to the following word. Longest first, so وال is
// stripped as one particle rather than leaving ال behind.
const PARTICLES = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

const MARKS = /[ً-ْ]/g;

/** Letters only: رقِّ is two letters carrying two marks, not four characters. */
const letterCount = (word: string) => word.replace(MARKS, '').length;

const isTerm = (word: string, term: string) => {
  if (word === term) return true;
  // The floor. A two-letter stem found inside a longer word is far more likely to be
  // that word than the term with a particle on it.
  if (letterCount(term) < 3) return false;
  return PARTICLES.some((particle) => word === particle + term);
};

interface Offence {
  key: string;
  term: string;
  replacement: string;
}

const offencesIn = (key: string, value: string): Offence[] => {
  const words = value.match(ARABIC_WORD) ?? [];
  return RETIRED_TERMS.filter((retired) =>
    words.some((word) => isTerm(word, retired.term))
  ).map((retired) => ({
    key,
    term: retired.term,
    replacement: retired.replacement,
  }));
};

const allOffences = (): Offence[] =>
  Object.entries(ar).flatMap(([key, value]) =>
    typeof value === 'string' ? offencesIn(key, value) : []
  );

describe('Arabic glossary', () => {
  it('uses no term the product retired', () => {
    expect(allOffences()).toEqual([]);
  });

  // A list that silently emptied would make the assertion above vacuous — it would
  // pass loudest at exactly the moment it stopped guarding anything.
  it('reads a policy that actually holds retired terms', () => {
    expect(RETIRED_TERMS.length).toBeGreaterThan(0);
    const malformed = RETIRED_TERMS.filter(
      (retired) =>
        !retired.term.trim() ||
        !retired.replacement.trim() ||
        !retired.concept.trim()
    );
    expect(malformed).toEqual([]);
  });

  // The two words the matcher exists to not report. Pinned because the natural
  // implementation — value.includes(term) — passes every other test in this file
  // while reporting both of these as defects.
  it('does not mistake a longer word for a retired term inside it', () => {
    expect(isTerm('مشاركات', 'مشاركة')).toBe(false);
    expect(isTerm('رقم', 'رق')).toBe(false);
    expect(isTerm('فرق', 'رق')).toBe(false);
  });

  it('still catches a retired term carrying a particle', () => {
    expect(isTerm('باقة', 'باقة')).toBe(true);
    expect(isTerm('الباقة', 'باقة')).toBe(true);
    expect(isTerm('والباقة', 'باقة')).toBe(true);
    expect(isTerm('الإحصاءات', 'إحصاءات')).toBe(true);
  });
});
