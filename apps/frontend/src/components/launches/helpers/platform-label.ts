import { capitalize } from 'lodash';
import i18next from 'i18next';

/**
 * Human-readable, localized platform name for a channel identifier.
 *
 * Identifiers may carry a suffix (e.g. `instagram-standalone`, `linkedin-page`,
 * `mastodon-custom`); the segment before the first `-` is the platform. The name
 * resolves through the i18n `platform_<base>` keys, falling back to a capitalized
 * base for any provider not yet in the map.
 */
export const platformLabel = (identifier: string): string => {
  const base = identifier.split('-')[0];
  return i18next.t(`platform_${base}`, capitalize(base));
};

/**
 * A name inside a translated sentence: a channel's, a brand's. Isolated
 * (FSI…PDI, the plain-text <bdi>) so a Latin name in an Arabic sentence, or the
 * reverse, keeps its own direction and its trailing punctuation stays with it.
 * The calls pass `escapeValue: false`: React escapes the text it renders, and
 * i18next escaping it first would show a name's & or ' as an entity.
 */
export const isolate = (text = '') => `\u2068${text}\u2069`;
