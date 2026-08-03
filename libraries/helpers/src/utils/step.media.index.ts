/**
 * Where a step lands, given where it started.
 *
 * `previous`/`next` are logical — what a control at the inline-start or
 * inline-end edge means, in either reading direction. `left`/`right` are
 * physical — what an arrow key reports — and only those mirror under `rtl`,
 * because in a right-to-left interface the next item sits to the left.
 *
 * Keeping both vocabularies here is what stops the caller reasoning about
 * direction at all, and makes the Arabic mapping testable without a browser.
 */
export type MediaStepDirection = 'previous' | 'next' | 'left' | 'right';

export const stepMediaIndex = ({
  current,
  total,
  direction,
  rtl = false,
}: {
  current: number;
  total: number;
  direction: MediaStepDirection;
  rtl?: boolean;
}): number => {
  const forward =
    direction === 'previous' || direction === 'next'
      ? direction === 'next'
      : (direction === 'right') !== rtl;

  // Clamped at both ends: the list never wraps, and the control at each end is
  // disabled there anyway.
  return Math.min(Math.max(current + (forward ? 1 : -1), 0), total - 1);
};
