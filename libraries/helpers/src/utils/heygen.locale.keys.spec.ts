// Guards the HeyGen avatar form (en + ar), the same way
// developers.locale.keys.spec.ts guards Settings › Developers: a key that exists
// only as an inline default renders English in every other language.
//
// A pin rather than the hard-coded English check, because that check excludes
// /third-parties/: the Integrations screen is hidden while SHOW_THIRD_PARTY is
// unset, so nothing under it reaches a reader today. Every user-facing string still
// needs its key in en and ar (FR-012 has no reachability carve-out), and these two
// would surface in English the moment the screen is switched on.
//
// Both labels go through the shared Select, which derives label_<text> and calls
// t() itself, so the keys appear nowhere in the source as written.
// (feature 035-upstream-sync-2026-10-review.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const SURFACES = [
  '../../../../apps/frontend/src/components/third-parties/providers/heygen.provider.tsx',
].map((file) => path.join(__dirname, file));

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;

describe('HeyGen avatar form locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');
  const source = SURFACES.map((file) => fs.readFileSync(file, 'utf8')).join(
    '\n'
  );

  // [the label the form renders, the key Select derives from it]
  it.each([
    ['Aspect Ratio', 'label_aspect_ratio'],
    ['Generate Captions', 'label_generate_captions'],
  ])('has a non-empty English and Arabic key for "%s"', (label, key) => {
    // A pin that outlives its label guards nothing.
    expect(source).toContain(`label="${label}"`);
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    expect(ar[key]).not.toBe(en[key]);
  });
});
