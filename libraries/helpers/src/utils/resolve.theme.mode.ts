/**
 * Resolves the app theme class from the `mode` cookie value.
 *
 * Default is light: only an explicit `dark` cookie yields dark, so new (no-cookie)
 * sessions and any unexpected value fall back to light. Used by the root layouts to
 * set the `<body>` theme class at SSR (FOUC-free) and by the client `mode` reads.
 */
export const resolveThemeClass = (
  cookieValue?: string
): 'light' | 'dark' => {
  return cookieValue === 'dark' ? 'dark' : 'light';
};
