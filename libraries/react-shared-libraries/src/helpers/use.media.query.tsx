'use client';

import { useEffect, useState } from 'react';

/**
 * The small-screen width query — the JavaScript mirror of Tailwind's `mobile`
 * screen (`max-width: 1025px`): phones and iPads held upright, where the app
 * shell, the composer and the calendar take their small-screen layout. Stated
 * once in `apps/frontend/DESIGN.md` and appears once per layer, because
 * `tailwind.config.cjs` is CommonJS consumed by PostCSS and cannot import from
 * `libraries/`. Change one, change the other.
 */
export const MOBILE_QUERY = '(max-width: 1025px)';

/**
 * Screens whose main pointer cannot hover: phones and tablets used by touch.
 * Hover-only help, the app's tooltip, stays off there. It asks about hover,
 * not pointer size like the `coarse:` variant, because hovering is what a
 * tooltip needs; on phones and tablets both answer the same. No Tailwind
 * variant mirrors it.
 */
export const NO_HOVER_QUERY = '(hover: none)';

/**
 * SSR-safe media-query hook. Returns false on the server and on the first
 * client render (so it matches the desktop-first SSR markup), then syncs to the
 * real match after mount — avoiding hydration mismatches. Use for render-time
 * responsive decisions that CSS alone can't express (e.g. swapping which
 * component renders), not for styling that a Tailwind variant already covers.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
