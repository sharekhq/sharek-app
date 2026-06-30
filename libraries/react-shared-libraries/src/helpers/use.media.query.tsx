'use client';

import { useEffect, useState } from 'react';

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
