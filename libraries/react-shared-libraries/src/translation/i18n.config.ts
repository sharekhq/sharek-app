export const fallbackLng = 'en';
export const languages = [
  fallbackLng,
  'ar',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
];

// Native display names for the selector (exact strings; deterministic, unlike
// Intl.DisplayNames which is CLDR/browser-dependent and lower-cases Romance names).
export const languageNames: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
};

export const rtlLanguages = ['ar'];

export const defaultNS = 'translation';
export const cookieName = 'i18next';
export const headerName = 'x-i18next-current-language';
