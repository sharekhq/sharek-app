// Fork-only (Sharek): optional allow-list for the provider catalog shown in
// "Add Channel". SHAREK_ENABLED_PROVIDERS is a comma-separated list of
// provider identifiers (e.g. "x,linkedin,instagram"); unset or empty means
// every provider stays listed, so vanilla deployments are unaffected.
export function filterEnabledProviders<T extends { identifier: string }>(
  providers: T[],
  allowList = process.env.SHAREK_ENABLED_PROVIDERS
): T[] {
  const enabled = (allowList || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!enabled.length) {
    return providers;
  }

  return providers.filter((p) => enabled.includes(p.identifier));
}
