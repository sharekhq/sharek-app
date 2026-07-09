import { Logger } from '@nestjs/common';

// Fork-only (Sharek): optional allow-list for the provider catalog shown in
// "Add Channel". SHAREK_LISTED_PROVIDERS is a comma-separated list of
// provider identifiers (e.g. "x,linkedin,instagram"); unset or empty means
// every provider stays listed, so vanilla deployments are unaffected.
// Listing only — connect/post paths are deliberately untouched so existing
// channels of an unlisted provider keep working.
const logger = new Logger('ListedProviders');
const warnedAllowLists = new Set<string>();

export function filterListedProviders<T extends { identifier: string }>(
  providers: T[],
  allowList = process.env.SHAREK_LISTED_PROVIDERS
): T[] {
  const raw = allowList || '';
  const listed = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!listed.length) {
    return providers;
  }

  const known = new Set(providers.map((p) => p.identifier.toLowerCase()));
  if (!warnedAllowLists.has(raw)) {
    warnedAllowLists.add(raw);
    for (const entry of listed) {
      if (!known.has(entry)) {
        logger.warn(
          `SHAREK_LISTED_PROVIDERS entry "${entry}" matches no provider identifier and will be ignored`
        );
      }
    }
  }

  return providers.filter((p) => listed.includes(p.identifier.toLowerCase()));
}
