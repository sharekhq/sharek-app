import { resolveEntryLanguage } from './resolve.entry.language';

// Inline mirror of `languages` in i18n.config.ts. The scoped jest config has no
// moduleNameMapper for `@gitroom/*`, so the allow-list is duplicated here rather
// than imported (the helper is parameterized on it precisely to stay import-free).
const supported = ['en', 'ar', 'de', 'fr', 'es', 'it', 'pt', 'ru'] as const;

describe('resolveEntryLanguage', () => {
  describe('absent or blank → null (no action)', () => {
    it('returns null for a null param', () => {
      expect(resolveEntryLanguage(null, undefined, supported)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(resolveEntryLanguage('', undefined, supported)).toBeNull();
    });

    it('returns null for a whitespace-only string', () => {
      expect(resolveEntryLanguage('   ', undefined, supported)).toBeNull();
    });

    it('returns null for a blank param even when a cookie is set', () => {
      expect(resolveEntryLanguage('', 'en', supported)).toBeNull();
    });
  });

  describe('exact allow-list match', () => {
    it('resolves a supported code on first visit (no cookie)', () => {
      expect(resolveEntryLanguage('ar', undefined, supported)).toBe('ar');
    });

    it('resolves every supported code to itself', () => {
      for (const code of supported) {
        expect(resolveEntryLanguage(code, undefined, supported)).toBe(code);
      }
    });
  });

  describe('explicit entry signal overrides a saved preference', () => {
    it('overrides a differing cookie (ar over en)', () => {
      expect(resolveEntryLanguage('ar', 'en', supported)).toBe('ar');
    });

    it('overrides in the other direction too (en over ar) — link wins', () => {
      expect(resolveEntryLanguage('en', 'ar', supported)).toBe('en');
    });
  });

  describe('idempotent re-entry → null (already applied)', () => {
    it('returns null when the param equals the current cookie', () => {
      expect(resolveEntryLanguage('ar', 'ar', supported)).toBeNull();
    });

    it('returns null when a regional variant resolves to the current cookie', () => {
      expect(resolveEntryLanguage('ar-SA', 'ar', supported)).toBeNull();
    });
  });

  describe('trim + case-insensitive normalization', () => {
    it('normalizes upper-case (AR → ar)', () => {
      expect(resolveEntryLanguage('AR', 'en', supported)).toBe('ar');
    });

    it('normalizes trailing whitespace + mixed case (Ar  → ar)', () => {
      expect(resolveEntryLanguage('Ar ', 'en', supported)).toBe('ar');
    });
  });

  describe('regional variants fall back to the base subtag (both separators)', () => {
    it('ar-SA → ar (hyphen)', () => {
      expect(resolveEntryLanguage('ar-SA', 'en', supported)).toBe('ar');
    });

    it('ar_SA → ar (underscore)', () => {
      expect(resolveEntryLanguage('ar_SA', 'en', supported)).toBe('ar');
    });

    it('pt-BR → pt', () => {
      expect(resolveEntryLanguage('pt-BR', undefined, supported)).toBe('pt');
    });

    it('en-GB → en', () => {
      expect(resolveEntryLanguage('en-GB', undefined, supported)).toBe('en');
    });

    it('en_GB → en (underscore)', () => {
      expect(resolveEntryLanguage('en_GB', undefined, supported)).toBe('en');
    });
  });

  describe('unsupported codes → null (FR-006)', () => {
    it.each(['he', 'zh-CN', 'xx'])('ignores %s', (code) => {
      expect(resolveEntryLanguage(code, undefined, supported)).toBeNull();
    });

    it('ignores an unsupported code even over an existing cookie', () => {
      expect(resolveEntryLanguage('he', 'ar', supported)).toBeNull();
    });
  });

  describe('junk / injection is inherently allow-list-safe → null', () => {
    it('ignores an HTML/script fragment', () => {
      expect(resolveEntryLanguage('<script>', undefined, supported)).toBeNull();
    });

    it('ignores a path-traversal string', () => {
      expect(resolveEntryLanguage('../../etc', undefined, supported)).toBeNull();
    });

    it('ignores a 1000-char string', () => {
      expect(
        resolveEntryLanguage('a'.repeat(1000), undefined, supported)
      ).toBeNull();
    });
  });
});
