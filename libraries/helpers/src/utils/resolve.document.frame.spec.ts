import { resolveDocumentFrame } from './resolve.document.frame';
import {
  fallbackLng,
  languages,
  rtlLanguages,
} from '@gitroom/react/translation/i18n.config';

const unsupported = ['he', 'zz', 'klingon', 'AR', 'ar-SA', '../../etc', '<script>'];
const themeValues = [undefined, '', 'light', 'dark', 'purple'];

describe('resolveDocumentFrame', () => {
  describe('language — falls back rather than passes through', () => {
    it('resolves a supported non-default language to itself', () => {
      expect(resolveDocumentFrame('de').language).toBe('de');
    });

    it('resolves the default language to itself', () => {
      expect(resolveDocumentFrame(fallbackLng).language).toBe(fallbackLng);
    });

    it('resolves every supported language to itself', () => {
      for (const code of languages) {
        expect(resolveDocumentFrame(code).language).toBe(code);
      }
    });

    it('falls back for an unsupported value', () => {
      expect(resolveDocumentFrame('he').language).toBe(fallbackLng);
    });

    it('falls back for every unsupported value, never passing it through', () => {
      for (const value of unsupported) {
        expect(resolveDocumentFrame(value).language).toBe(fallbackLng);
      }
    });

    it('falls back for an absent value', () => {
      expect(resolveDocumentFrame(undefined).language).toBe(fallbackLng);
    });

    it('falls back for an empty value', () => {
      expect(resolveDocumentFrame('').language).toBe(fallbackLng);
    });
  });

  describe('direction — derived from the language, never supplied', () => {
    it('gives the default language ltr', () => {
      expect(resolveDocumentFrame(fallbackLng).direction).toBe('ltr');
    });

    it('gives every supported RTL language rtl', () => {
      for (const code of rtlLanguages) {
        expect(resolveDocumentFrame(code).direction).toBe('rtl');
      }
    });

    it('gives a supported LTR language ltr', () => {
      expect(resolveDocumentFrame('de').direction).toBe('ltr');
    });

    it('gives an unsupported value ltr, because it resolved to the fallback', () => {
      for (const value of unsupported) {
        expect(resolveDocumentFrame(value).direction).toBe('ltr');
      }
    });

    it('gives an absent value ltr', () => {
      expect(resolveDocumentFrame(undefined).direction).toBe('ltr');
    });

    it('gives an empty value ltr', () => {
      expect(resolveDocumentFrame('').direction).toBe('ltr');
    });

    it('never contradicts the language it returned', () => {
      for (const value of [...languages, ...unsupported, undefined, '']) {
        const frame = resolveDocumentFrame(value);
        expect(frame.direction).toBe(
          rtlLanguages.includes(frame.language) ? 'rtl' : 'ltr'
        );
      }
    });
  });

  describe('theme — composes the existing resolver, dark unless explicitly light', () => {
    it('returns light when the mode cookie is "light"', () => {
      expect(resolveDocumentFrame(fallbackLng, 'light').theme).toBe('light');
    });

    it('returns dark when the mode cookie is "dark"', () => {
      expect(resolveDocumentFrame(fallbackLng, 'dark').theme).toBe('dark');
    });

    it('defaults to dark when the mode cookie is absent', () => {
      expect(resolveDocumentFrame(fallbackLng, undefined).theme).toBe('dark');
    });

    it('defaults to dark for an empty mode cookie', () => {
      expect(resolveDocumentFrame(fallbackLng, '').theme).toBe('dark');
    });

    it('defaults to dark for an unrecognised mode cookie', () => {
      expect(resolveDocumentFrame(fallbackLng, 'purple').theme).toBe('dark');
    });

    it('resolves the theme independently of the language', () => {
      for (const code of [...languages, ...unsupported, undefined, '']) {
        expect(resolveDocumentFrame(code, 'light').theme).toBe('light');
        expect(resolveDocumentFrame(code, 'dark').theme).toBe('dark');
      }
    });
  });

  describe('consistent with what the dashboard computes inline today (FR-014)', () => {
    // `(app)/layout.tsx` resolved `cookie || fallbackLng` and
    // `rtlLanguages.includes(language) ? 'rtl' : 'ltr'`. For every input it handled
    // correctly — a supported code, or nothing — the resolver must agree exactly, so
    // the refactor is byte-identical by construction rather than by inspection.
    it('matches the inline derivation for every supported language and both themes', () => {
      for (const code of [...languages, undefined, '']) {
        const language = code || fallbackLng;
        expect(resolveDocumentFrame(code, 'light')).toEqual({
          language,
          direction: rtlLanguages.includes(language) ? 'rtl' : 'ltr',
          theme: 'light',
        });
        expect(resolveDocumentFrame(code, undefined)).toEqual({
          language,
          direction: rtlLanguages.includes(language) ? 'rtl' : 'ltr',
          theme: 'dark',
        });
      }
    });
  });

  describe('total — no input throws (FR-013)', () => {
    it('does not throw for any combination of language and theme value', () => {
      for (const code of [...languages, ...unsupported, undefined, '']) {
        for (const theme of themeValues) {
          expect(() => resolveDocumentFrame(code, theme)).not.toThrow();
        }
      }
    });

    it('does not throw when called with no arguments at all', () => {
      expect(() => resolveDocumentFrame()).not.toThrow();
      expect(resolveDocumentFrame()).toEqual({
        language: fallbackLng,
        direction: 'ltr',
        theme: 'dark',
      });
    });
  });
});
