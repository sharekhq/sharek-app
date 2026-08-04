// English names for the languages the interface ships, keyed by the same codes
// as the selector catalog (`languages` in i18n.config.ts, which
// language.catalog.spec guards against drift). These go into Samy's system
// prompt, which is written in English — `languageNames` holds the native names
// the selector itself shows.
export const englishLanguageNames: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
};

/**
 * The English name of an interface language, or null when the value names none
 * that we ship. The caller is a prompt and the value reaches it from the
 * browser, so nothing about its type is guaranteed and this never throws: an
 * unknown language has to read as "no language", not as a name to state.
 *
 * A regional variant resolves to its base language — i18next's detector reports
 * what it read ('en-US'), not the code the interface resolved to.
 */
export const languageName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.split('-')[0].toLowerCase();
  // Declared, not inherited: a bare lookup answers 'constructor' with a
  // function and '__proto__' with an object, both truthy and both typed
  // `string` by the Record above, so neither TypeScript nor the caller would
  // notice one reaching the prompt.
  return Object.prototype.hasOwnProperty.call(englishLanguageNames, code)
    ? englishLanguageNames[code]
    : null;
};
