// Fork-only (Sharek): how a visitor arrived — the campaign parameters, CTA id
// and click ids of their first arrival, plus the app's referrer and landing
// address — and the one rule that validates it on both sides of registration.
//
// Zero imports, deliberately: the browser bundle imports this module, and
// anything imported here would be pulled into it.
const QUERY_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'gclid',
  'fbclid',
  'ttclid',
] as const;

export const ATTRIBUTION_KEYS = [
  ...QUERY_KEYS,
  'referrer',
  'landing_url',
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];

export type AttributionSet = Partial<Record<AttributionKey, string>>;

export const ATTRIBUTION_MAX_LENGTH = 256;

// Activation and password-reset links carry a JWT in the path, and
// ?loggedAuth= carries a session JWT. The API accepts any of them as a login,
// with no expiry, so none may reach PostHog: the browser masks them in every
// event, and the arrival set drops a value that carries one.
export const AUTH_TOKEN_IN_URL =
  /(\/auth\/(?:activate|forgot)\/|[?&]loggedAuth=)[\w.-]+/g;

/**
 * Keeps a named key only when its value is a non-blank string within
 * ATTRIBUTION_MAX_LENGTH that carries no login token, stored trimmed.
 * Anything else is dropped — never truncated, and never a reason to fail the
 * request that carried it.
 */
export function pickAttribution(input: unknown): AttributionSet {
  const set: AttributionSet = {};
  if (!input || typeof input !== 'object') {
    return set;
  }
  for (const key of ATTRIBUTION_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (
      trimmed &&
      trimmed.length <= ATTRIBUTION_MAX_LENGTH &&
      trimmed.search(AUTH_TOKEN_IN_URL) === -1
    ) {
      set[key] = trimmed;
    }
  }
  return set;
}

// The query is captured key by key, and a paid-click address runs past the
// length rule, so the landing address is kept as origin and path only.
const originAndPath = (href: string) => {
  try {
    const url = new URL(href);
    return url.origin + url.pathname;
  } catch {
    return undefined;
  }
};

export function readAttribution(
  search: URLSearchParams,
  referrer: string,
  landingUrl: string
): AttributionSet {
  return pickAttribution({
    ...Object.fromEntries(QUERY_KEYS.map((key) => [key, search.get(key)])),
    referrer,
    landing_url: originAndPath(landingUrl),
  });
}

// The query keys take the initial person properties PostHog already reports
// on. The app's referrer and landing address take names of their own:
// $initial_referrer and $initial_current_url hold the marketing site's first
// touch for a visitor who accepted analytics there, and must not be replaced.
const INITIAL_PERSON_PROPERTIES: Record<AttributionKey, string> = {
  utm_source: '$initial_utm_source',
  utm_medium: '$initial_utm_medium',
  utm_campaign: '$initial_utm_campaign',
  utm_term: '$initial_utm_term',
  utm_content: '$initial_utm_content',
  ref: '$initial_ref',
  gclid: '$initial_gclid',
  fbclid: '$initial_fbclid',
  ttclid: '$initial_ttclid',
  referrer: 'app_referrer',
  landing_url: 'app_landing_url',
};

/** The person properties a new account's sign-up sets once. */
export function toInitialPersonProperties(
  set: AttributionSet
): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = set[key];
    if (value) {
      properties[INITIAL_PERSON_PROPERTIES[key]] = value;
    }
  }
  return properties;
}
