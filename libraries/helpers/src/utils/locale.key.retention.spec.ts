// Feature 028-arabic-language-audit (C4).
// Guards the six upstream-owned locales against silently losing a translation they
// already carry. Replacing a key that de/fr/es/it/pt/ru have all translated ships the
// replacement to en and ar only, dropping those six to the English default — while
// every en-versus-ar assertion in this suite stays green, because en and ar are both
// correct. Feature 027 came within one commit of shipping exactly that (the
// logout_from replacement, see paywall.locale.keys.spec.ts).
//
// Unlike the other checks in this feature, this one is green from its first run and
// is meant to stay that way: it is a retention guard, not a red-green cycle. Making
// it fail would mean deliberately deleting six locales' translations.
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

interface Baseline {
  locales: string[];
  keys: string[];
}

// Read from disk rather than imported: ts-jest transpiles each file alone here and
// the scoped config sets no resolveJsonModule, so an import would resolve at build
// time and not under test. The locale files are read the same way for the same reason.
const baseline: Baseline = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'locale.key.retention.baseline.json'),
    'utf8'
  )
);

const readLocaleKeys = (lng: string) =>
  new Set(
    Object.keys(
      JSON.parse(
        fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
      )
    )
  );

describe('upstream locale key retention', () => {
  it.each(baseline.locales)(
    '%s still carries every key it had at the branch point',
    (lng) => {
      const present = readLocaleKeys(lng);
      // Named, not counted: the fix is per key, and a count cannot say which.
      const lost = baseline.keys.filter((key) => !present.has(key));
      expect(lost).toEqual([]);
    }
  );

  // A baseline that silently emptied would make every assertion above vacuous. The
  // six are spelled out rather than derived from i18n.config's `languages`, as
  // paywall.locale.keys.spec.ts derives its subset: this records what those locales
  // held at one moment, not which languages ship now.
  it('reads a baseline that actually holds the six locales and their keys', () => {
    expect(baseline.locales).toEqual(['de', 'fr', 'es', 'it', 'pt', 'ru']);
    expect(baseline.keys).toHaveLength(760);
  });
});
