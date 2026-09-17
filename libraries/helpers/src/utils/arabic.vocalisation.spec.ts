// Feature 028-arabic-language-audit (C1).
// Guards the Arabic house style against vocalisation marks creeping back. The app
// had accumulated 202 marks across 156 keys while sharek.app's 61,416 characters of
// Arabic carry essentially none but tanween fath — nothing watched, so the drift was
// invisible. Tanween fath is the one mark the style keeps (صورًا، معًا، فورًا), which
// is why it is absent from the rejected list rather than exempted per key.
//
// Named per word, never counted: the fix is per word, and a count cannot say which.
// The offending word is reported alongside the key because the same key can carry
// several marks and the remedy differs by class — strip a shadda, respell a
// defective-verb imperative (research R4).
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

// Read from disk rather than imported, as locale.key.retention.spec.ts does and for
// the same reason: the scoped jest config sets no resolveJsonModule.
const ar: Record<string, unknown> = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, 'ar', 'translation.json'), 'utf8')
);

// Every Arabic combining mark the house style rejects, named so a failure reads as a
// sentence rather than a code point. U+064B tanween fath is deliberately absent: it
// is the mark the style uses, measured at 147 occurrences against 4 shadda and one
// damma across the shipped Arabic.
const REJECTED_MARKS: Readonly<Record<string, string>> = {
  'ٌ': 'tanween damm',
  'ٍ': 'tanween kasr',
  'َ': 'fatha',
  'ُ': 'damma',
  'ِ': 'kasra',
  'ّ': 'shadda',
  'ْ': 'sukun',
};

interface StyleException {
  /** The ar key allowed to keep its mark. */
  key: string;
  /** The mark it keeps, as one of REJECTED_MARKS' code points. */
  mark: string;
  /** Why, in the maintainer's own words. An exception without one is a failure. */
  reason: string;
}

// Populated only from a maintainer decision (T040). Empty means the house style holds
// everywhere, which is the intended end state — not that nobody looked.
const EXCEPTIONS: readonly StyleException[] = [];

interface Offence {
  key: string;
  word: string;
  mark: string;
}

const isExcepted = (key: string, mark: string) =>
  EXCEPTIONS.some(
    (exception) => exception.key === key && exception.mark === mark
  );

// The word carrying the mark, not the whole value: a 120-character sentence with one
// shadda in it reports as that one word.
const offencesIn = (key: string, value: string): Offence[] =>
  value
    .split(/\s+/)
    .flatMap((word) =>
      Object.entries(REJECTED_MARKS)
        .filter(([mark]) => word.includes(mark) && !isExcepted(key, mark))
        .map(([, name]) => ({ key, word, mark: name }))
    );

const allOffences = (): Offence[] =>
  Object.entries(ar).flatMap(([key, value]) =>
    typeof value === 'string' ? offencesIn(key, value) : []
  );

describe('Arabic vocalisation house style', () => {
  it('carries no vocalisation mark but tanween fath', () => {
    expect(allOffences()).toEqual([]);
  });

  it('gives a reason for every style exception', () => {
    const unreasoned = EXCEPTIONS.filter(
      (exception) => !exception.reason.trim()
    );
    expect(unreasoned).toEqual([]);
  });

  // An exception outliving the string it excused turns into a silent licence for the
  // next mark on that key. Listing one is a decision; keeping a dead one is not.
  it('lists no exception for a key that no longer carries its mark', () => {
    const stale = EXCEPTIONS.filter((exception) => {
      const value = ar[exception.key];
      return typeof value !== 'string' || !value.includes(exception.mark);
    });
    expect(stale).toEqual([]);
  });
});
