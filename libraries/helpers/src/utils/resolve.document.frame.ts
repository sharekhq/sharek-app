import { resolveThemeClass } from './resolve.theme.mode';
import {
  fallbackLng,
  languages,
  rtlLanguages,
} from '@gitroom/react/translation/i18n.config';

export interface DocumentFrame {
  language: string;
  direction: 'rtl' | 'ltr';
  theme: 'light' | 'dark';
}

/**
 * Resolves the three facts a root layout needs to render its document element:
 * the language it declares, the direction that language reads in, and the theme
 * class the body carries.
 *
 * Takes the two cookie *values* rather than a cookie store, so it stays pure and
 * does not bind to a framework request API — the caller reads them. Direction is
 * derived and never supplied, so a caller cannot render a frame whose direction
 * contradicts its language. An unsupported or absent language resolves to the
 * fallback rather than passing through, and no input throws.
 *
 * Unlike `resolve.entry.language.ts`, which is parameterized on the allow-list to
 * keep the i18n config out of the edge-runtime middleware bundle, this one imports
 * it: its callers are server layouts, and the config is plain constants.
 */
export const resolveDocumentFrame = (
  languageCookie?: string,
  themeCookie?: string
): DocumentFrame => {
  const language =
    languageCookie && languages.includes(languageCookie)
      ? languageCookie
      : fallbackLng;

  return {
    language,
    direction: rtlLanguages.includes(language) ? 'rtl' : 'ltr',
    theme: resolveThemeClass(themeCookie),
  };
};
