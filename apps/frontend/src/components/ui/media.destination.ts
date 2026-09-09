/**
 * Where a generated image or video goes once it is ready — what the waiting
 * note promises, and what the action that accepts it is called.
 *
 * Not whether it is kept: everything generated is saved to the Media library
 * before the modal ever shows it (`media.controller.ts` uploads and saves the
 * file), so this names only what happens next. `post` is the composer,
 * `media` is Studio, where nothing is being composed, and `reference` is a
 * provider's reference-image row.
 *
 * Shared by the AI image and AI video modals and the media row that mounts
 * them, so it lives here rather than in any one of them.
 */
export type MediaDestination = 'post' | 'media' | 'reference';
