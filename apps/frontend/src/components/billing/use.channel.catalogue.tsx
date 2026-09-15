'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR from 'swr';

/**
 * The channels the strip shows by name. Exported because the remainder is
 * everything the catalogue holds *beyond* these, so the list and the arithmetic
 * cannot drift apart the way a hardcoded 8 in the component would.
 */
export const SHOWN_CHANNELS = [
  'instagram',
  'x',
  'facebook',
  'linkedin',
  'tiktok',
  'youtube',
  'threads',
  'pinterest',
];

/**
 * How many connectable channels the strip is not naming.
 *
 * Derived rather than written down because all three candidate literals
 * disagree: the live endpoint answers 32, `socialIntegrationList` defines 36,
 * and `SHAREK_LISTED_PROVIDERS` / `HIDDEN_PROVIDERS` trim it at runtime. A
 * number typed into a checkout page goes stale without anyone noticing.
 *
 * `null` rather than 0 whenever there is nothing to add — loading, failed, or a
 * catalogue no larger than the icons already shown — so the strip drops its
 * remainder instead of advertising "+0", and never blocks or reflows the page
 * around a fetch it does not need.
 */
export const useChannelCatalogue = () => {
  const fetch = useFetch();

  const load = useCallback(async (path: string) => {
    return (await (await fetch(path)).json()).social;
  }, []);

  // Its own key: `/integrations/list` is the organisation's *connected*
  // channels, already fetched under that key by the launches screens. This is
  // the catalogue of everything connectable, which is a different question.
  const { data } = useSWR('/integrations', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  const total = data?.length ?? 0;

  return {
    remainder:
      total > SHOWN_CHANNELS.length ? total - SHOWN_CHANNELS.length : null,
  };
};
