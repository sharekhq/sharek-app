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

/**
 * Keeps a named key only when its value is a non-blank string within
 * ATTRIBUTION_MAX_LENGTH, stored trimmed. Anything else is dropped — never
 * truncated, and never a reason to fail the request that carried it.
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
    if (trimmed && trimmed.length <= ATTRIBUTION_MAX_LENGTH) {
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
