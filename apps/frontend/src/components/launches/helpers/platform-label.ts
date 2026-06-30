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
