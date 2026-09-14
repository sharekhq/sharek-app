// Guards the Settings › Developers surfaces (en + ar), the same way
// tiktok.locale.keys.spec.ts guards the composer: a key that exists only as an
// inline t() default renders English in every other language, and the
// duplicate-key spec cannot see it because it never compares one locale
// against another.
//
// The 2026-09 upstream sync rewrote the Developers page and added the approved
// apps list; three of their keys arrived referenced but untranslated.
// (feature 025-upstream-sync-review.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

// The two components behind Settings › Developers: the page itself, and the
// approved-apps list its revoke dialog belongs to. They live in different
// directories, so these are full relative paths rather than bare filenames.
const SURFACES = [
  '../../../../apps/frontend/src/components/public-api/public.component.tsx',
  '../../../../apps/frontend/src/components/approved-apps/approved-apps.component.tsx',
].map((file) => path.join(__dirname, file));

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;

describe('Developers surfaces locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each([
    // The Developers page's own copy, renamed off the upstream key names by
    // the sync's rewrite.
    'use_sharek_api_to_integrate_with_your_tools',
    'connect_your_mcp_client_to_sharek_to_schedule_your_posts_faster',
    // The approved-apps revoke confirmation.
    'are_you_sure_revoke_access',
  ])('has a non-empty English and Arabic %s', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
  });

  it('keeps the revoke confirmation interpolated in both locales', () => {
    // The call site passes { name }. Before this key existed its default was a
    // template literal, which i18next silently drops the moment the key is
    // present — the user would read "revoke access for ?" with the app name
    // gone. The placeholder has to survive in both locales.
    expect(en.are_you_sure_revoke_access).toContain('{{name}}');
    expect(ar.are_you_sure_revoke_access).toContain('{{name}}');
  });

  it('keeps "Sharek" in Latin script on the Developers page', () => {
    // The brand name is never transliterated, and both of these sentences name
    // the product whose API and MCP server the reader is about to wire up.
    expect(ar.use_sharek_api_to_integrate_with_your_tools).toContain('Sharek');
    expect(
      ar.connect_your_mcp_client_to_sharek_to_schedule_your_posts_faster
    ).toContain('Sharek');
  });
});

describe('Developers surfaces — every string they render', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');
  const source = SURFACES.map((file) => fs.readFileSync(file, 'utf8')).join(
    '\n'
  );

  // Read off the components rather than listed here on purpose: a hardcoded
  // list cannot catch the next key that ships as an inline t() default only.
  // Both `t(` and `i18next.t(` appear here — the client table builds its hints
  // in module scope, outside the hook.
  const referenced = Array.from(
    new Set(
      Array.from(
        source.matchAll(
          /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*'([A-Za-z0-9_]+)'/g
        ),
        (match) => match[1]
      )
    )
  ).sort();

  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(referenced.length).toBeGreaterThan(45);
    expect(referenced).toContain('use_sharek_api_to_integrate_with_your_tools');
    expect(referenced).toContain('are_you_sure_revoke_access');
  });

  it.each(referenced)('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    // Identical bytes in both locales means the English was copied across
    // rather than translated, which reads as done and is not.
    expect(ar[key]).not.toBe(en[key]);
  });
});
