'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCallback } from 'react';
import useSWR, { SWRResponse } from 'swr';

// What the media library lists (data-model.md): the caller's type, else the
// Media page's filter (none = all files), the order, and the search as typed,
// trimmed when it is sent.
export type MediaLibraryQuery = {
  type?: 'image' | 'image-static' | 'video';
  sort: 'newest' | 'oldest';
  search: string;
};

// How many files a month holds under the list's type and search, for its
// heading (GET /media/month, research R4). The month is its start and the next
// month's start in the user's timezone, as UTC instants. The order isn't sent:
// a month holds the same files either way. A count never refetches on focus or
// reconnect while its month's files don't, but it asks again when its heading
// mounts over a cached one, as the list's pages do.
export const useMediaMonthCount = (
  query: MediaLibraryQuery,
  month: { from: string; to: string }
): SWRResponse<{ count: number }> => {
  const fetch = useFetch();
  const params = new URLSearchParams({ from: month.from, to: month.to });
  if (query.type) {
    params.set('type', query.type);
  }
  if (query.search.trim()) {
    params.set('search', query.search.trim());
  }

  // A failed answer (a 500 has a JSON body too) is an error SWR asks again
  // for, never a count to show
  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load the month count');
      }
      return response.json();
    },
    [fetch]
  );

  return useSWR<{ count: number }>(`/media/month?${params.toString()}`, load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};
