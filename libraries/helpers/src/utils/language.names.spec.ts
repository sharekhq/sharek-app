import { englishLanguageNames, languageName } from './language.names';

describe('languageName', () => {
  // The names go into an English system prompt, so they are English names —
  // `languageNames` in i18n.config.ts holds the native ones the selector shows.
  it('names every language the interface ships', () => {
    expect(englishLanguageNames).toEqual({
      en: 'English',
      ar: 'Arabic',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
    });
  });

  // i18next's detector reports what it read, so a browser set to a regional
  // variant arrives as 'en-US' even though the interface resolved to 'en'.
  it('resolves a regional variant to its base language', () => {
    expect(languageName('en-US')).toBe('English');
    expect(languageName('ar-EG')).toBe('Arabic');
    expect(languageName('pt-BR')).toBe('Portuguese');
  });

  it('ignores case', () => {
    expect(languageName('AR')).toBe('Arabic');
    expect(languageName('En-gb')).toBe('English');
  });

  // A language we do not ship must not be named: the caller falls back to its
  // own wording rather than stating something untrue about the interface.
  it('returns null for a language the interface does not ship', () => {
    expect(languageName('he')).toBeNull();
    expect(languageName('ja')).toBeNull();
  });

  // A plain object inherits from Object.prototype, so a bare lookup answers
  // `constructor` with a function and `__proto__` with an object — both truthy,
  // neither a language, and both typed as `string` by the Record. Left alone,
  // "constructor" from the browser would put `function Object() { [native
  // code] }` into Samy's system prompt as the language to reply in.
  it('returns null for a key it inherits rather than declares', () => {
    expect(languageName('constructor')).toBeNull();
    expect(languageName('__proto__')).toBeNull();
    expect(languageName('hasOwnProperty')).toBeNull();
  });

  // The value is browser-supplied through CopilotKit `properties`, so nothing
  // about its type is guaranteed and this may never throw.
  it('returns null for anything that is not a language code', () => {
    for (const value of [
      undefined,
      null,
      '',
      '   ',
      42,
      {},
      [],
      ['ar'],
      'not a language',
    ]) {
      expect(languageName(value)).toBeNull();
    }
  });
});
