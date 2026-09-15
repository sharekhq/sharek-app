/**
 * Which cut of the product tutorial to play, and where it lives.
 *
 * The tutorial is recorded twice — once in Arabic, once in English — and the
 * two cuts are different videos, not subtitled copies of one. Every other
 * language the selector offers falls back to the English cut, which is the
 * only other language the recordings exist in.
 *
 * Shared by the paywall headline and onboarding step 2, so it lives here
 * rather than in either of them.
 */
export const TUTORIAL_VIDEO_IDS = {
  ar: 'sqU-KHuwfyo',
  en: 'RIfZeP_3cbQ',
} as const;

/**
 * `language` is `i18next.resolvedLanguage`, which is typed as possibly
 * undefined and normally already a base tag — but a cookie or an
 * Accept-Language header can carry a regional form through, so the region is
 * dropped before the lookup rather than falling all the way back to English on
 * an `ar-SA`.
 */
export const tutorialVideoEmbedUrl = (language?: string) => {
  const base = (language || '').split('-')[0];
  const id =
    base in TUTORIAL_VIDEO_IDS
      ? TUTORIAL_VIDEO_IDS[base as keyof typeof TUTORIAL_VIDEO_IDS]
      : TUTORIAL_VIDEO_IDS.en;

  // The frame is only ever built after the user asked to watch, so it starts
  // itself rather than asking a second time.
  return `https://www.youtube.com/embed/${id}?autoplay=1`;
};
