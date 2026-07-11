/**
 * Resolves a marketing-site entry-language query param (`?lng=`) to a supported
 * language code, or `null` when there is nothing to do.
 *
 * Non-null return = "act": set the `i18next` cookie to this value and self-redirect.
 * `null` = "no action": the param is absent, blank, unsupported, or already applied
 * (equal to `current`), so the existing cookie → Accept-Language → `en` chain stays
 * byte-identical (FR-006).
 *
 * Pure and dependency-free (mirrors `resolve.theme.mode.ts`); the allow-list is passed
 * in so the helper never imports the React i18n config. Trims, lower-cases, matches the
 * allow-list exactly, else falls back to the base subtag of a regional variant
 * (`ar-SA`/`pt_BR` → `ar`/`pt`, both `-` and `_` separators).
 */
export const resolveEntryLanguage = (
  raw: string | null,
  current: string | undefined,
  supported: readonly string[]
): string | null => {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  const base = normalized.split(/[-_]/)[0];

  let resolved: string | null = null;
  if (supported.includes(normalized)) {
    resolved = normalized;
  } else if (base && supported.includes(base)) {
    resolved = base;
  }

  if (!resolved || resolved === current) {
    return null;
  }

  return resolved;
};
