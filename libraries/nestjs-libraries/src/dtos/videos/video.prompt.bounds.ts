/**
 * The one source of truth for how long a video prompt may be. It lives beside
 * the provider params classes that validate against it and is imported by the
 * frontend too, so the number that rejects a request cannot drift from the
 * number the hint, the counter and the error message quote.
 *
 * Zero imports, deliberately: the frontend imports this module, and anything
 * imported here would be pulled into the browser bundle
 * (`dtos/media/image.generation.catalog.ts` is the precedent).
 */

/** Shortest prompt either video provider will accept. Below this the API rejects. */
export const VIDEO_PROMPT_MIN_CHARS = 15;

/** Longest prompt either video provider will accept. */
export const VIDEO_PROMPT_MAX_CHARS = 2000;
