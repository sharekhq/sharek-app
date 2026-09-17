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
import {
  PLUG_CONCEPT,
  RETIRED_TERMS,
} from '@gitroom/react/translation/arabic-policy';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string): Record<string, unknown> =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const ar = readLocale('ar');
// The plug-concept rule is scoped by the ENGLISH a key carries, so en is read too.
const en = readLocale('en');

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

// A retired term can be more than one word — التوصيل التلقائي is the modal title's
// name for plugs — and the word matcher above cannot see one: the only word in it
// short enough to match on its own is وصل, which R6 already established has no real
// uses and must not be retired, and matching it would report الموصل.
//
// So a multi-word term is matched as consecutive whole words. Only the first can
// carry a particle (والتوصيل التلقائي); Arabic does not attach one mid-phrase, so the
// rest must match exactly. Reusing isTerm for the first word keeps the three-letter
// floor in force for phrases too.
const startsPhrase = (words: string[], at: number, term: string) => {
  const parts = term.split(/\s+/);
  return parts.every((part, index) => {
    const word = words[at + index];
    if (word === undefined) return false;
    return index === 0 ? isTerm(word, part) : word === part;
  });
};

const hasTerm = (words: string[], term: string) =>
  term.includes(' ')
    ? words.some((_word, at) => startsPhrase(words, at, term))
    : words.some((word) => isTerm(word, term));

interface Offence {
  key: string;
  term: string;
  replacement: string;
}

const offencesIn = (key: string, value: string): Offence[] => {
  const words = value.match(ARABIC_WORD) ?? [];
  return RETIRED_TERMS.filter((retired) => hasTerm(words, retired.term)).map(
    (retired) => ({
      key,
      term: retired.term,
      replacement: retired.replacement,
    })
  );
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

  // The two words a phrase term must not be reduced to, and the phrase itself with
  // and without a leading particle. Pinned because the obvious implementation —
  // adding وصل to RETIRED_TERMS — reports الموصل and وصلت as defects.
  it('matches a multi-word term as a phrase, not as its parts', () => {
    const words = (value: string) => value.match(ARABIC_WORD) ?? [];
    const term = 'التوصيل التلقائي';
    expect(hasTerm(words('التوصيل التلقائي: {{title}}'), term)).toBe(true);
    expect(hasTerm(words('تفعيل والتوصيل التلقائي هنا'), term)).toBe(true);
    expect(hasTerm(words('التوصيل السريع'), term)).toBe(false);
    expect(hasTerm(words('الوضع التلقائي'), term)).toBe(false);
    expect(hasTerm(words('وصلت رسالتك إلى الموصل'), term)).toBe(false);
  });
});

// The concept the app named three ways. Scoped by the English rather than by a list
// of keys, so this keeps guarding keys that do not exist yet: any future key whose
// English says "plug" is held to the same Arabic, and "Auto Repost Posts" — a plug
// title that never uses the word — correctly is not.
//
// Separate from the retired-terms rule above because one of the three old names,
// إعلان, is correct Arabic elsewhere: seven Announcement keys use it properly, and
// retiring it globally would report all seven.
describe('the plugs concept', () => {
  const namesTheConcept = Object.entries(en).filter(
    ([, value]) =>
      typeof value === 'string' && PLUG_CONCEPT.english.test(value)
  );

  interface Misnaming {
    key: string;
    english: string;
    arabic: string;
    problem: string;
  }

  const misnamings = (): Misnaming[] =>
    namesTheConcept.flatMap(([key, english]) => {
      const arabic = typeof ar[key] === 'string' ? (ar[key] as string) : '';
      const wrong = PLUG_CONCEPT.forbidden.filter((stem) =>
        arabic.includes(stem)
      );
      const problem = !PLUG_CONCEPT.arabic.test(arabic)
        ? `does not name the concept ${PLUG_CONCEPT.arabic.source}`
        : wrong.length
        ? `still says ${wrong.join(', ')}`
        : '';
      return problem
        ? [{ key, english: String(english), arabic, problem }]
        : [];
    });

  it('is named the same way everywhere it is named', () => {
    expect(misnamings()).toEqual([]);
  });

  // Without this the assertion above passes by finding nothing to check — which is
  // exactly what happens if the English is reworded or the regex loses its flag.
  it('finds the keys whose English names the concept', () => {
    expect(namesTheConcept.length).toBeGreaterThan(0);
    expect(namesTheConcept.map(([key]) => key).sort()).toContain('plugs');
  });
});
