// The one key-derivation formula.
//
// A translation key can be derived from the English text it translates, which is how
// form labels have always worked here: <Input label="Post Type"> resolves label_post_type
// without anyone naming that key. Feature 029 extends the same idea to the text the
// server declares — plug titles, field placeholders, the X preference, validation
// refusals — so that providers, which are upstream-owned and merged weekly, keep
// declaring English and the client translates it by key.
//
// That only holds while every side derives the *same* key. The renderer and the guard
// that checks the key exists (arabic.server.strings.spec.ts, C6) must agree exactly,
// and the formula lived inline in two components before this file, which is the drift
// the guard is meant to prevent: a guard computing label_post_type while the component
// asks for label_posttype would be green on a screen showing English.
//
// So it lives here once, and TranslatedLabel, TopTitle, the render-site wrappers and
// C6 all import it. C6 is a plain Node spec that cannot import a .tsx file under the
// helpers jest transform, which is why this is a .ts module of its own rather than a
// helper hanging off translated-label.tsx.
//
// The formula is unchanged from the two copies it replaces — lowercase, runs of
// whitespace to a single underscore, then drop everything that is not a word
// character. top.title.component.spec.tsx pins that byte-for-byte against keys the
// locale already carries.

/**
 * Derives the translation key a piece of English text resolves through.
 *
 * @param prefix - The family the key belongs to: `label`, `top_title`, `plug`,
 *                 `placeholder`, `setting` or `validation`.
 * @param text - The English text, verbatim as declared or written.
 */
export const deriveTranslationKey = (prefix: string, text: string) =>
  `${prefix}_${text.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '')}`;
