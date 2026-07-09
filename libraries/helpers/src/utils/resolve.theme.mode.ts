/**
 * Resolves the app theme class from the `mode` cookie value.
 *
 * Default is dark: only an explicit `light` cookie yields light, so new (no-cookie)
 * sessions and any unexpected value fall back to dark. Used by the root layouts to
 * set the `<body>` theme class at SSR (FOUC-free) and by the client `mode` reads.
 */
export const resolveThemeClass = (
  cookieValue?: string
): 'light' | 'dark' => {
  return cookieValue === 'light' ? 'light' : 'dark';
};
