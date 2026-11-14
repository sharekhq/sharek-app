'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Media } from '@prisma/client';
import { uniqBy } from 'lodash';
import { useCallback, useMemo } from 'react';
import useSWR, { SWRResponse, useSWRConfig } from 'swr';
import useSWRInfinite, { SWRInfiniteKeyedMutator } from 'swr/infinite';

// What the media library lists (data-model.md): the caller's type, else the
// Media page's filter (none = all files), the order, and the search as typed,
// trimmed when it is sent.
export type MediaLibraryQuery = {
  type?: 'image' | 'image-static' | 'video';
  sort: 'newest' | 'oldest';
  search: string;
};

// A file of the list (data-model.md): today's row, plus its tile image when
// the storage made one.
export type MediaLibraryRow = Media & { tileImage?: string };

// A page of GET /media: up to 32 files, and how many pages the list holds.
type MediaLibraryPage = { pages: number; results: MediaLibraryRow[] };

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

// The list's files (GET /media, research R2): offset pages of 32, the next one
// asked for as the list scrolls, flattened in order with each file once (a
// file added between two loads pushes a row onto the next page as well).
// Pages load side by side and loading more never refetches page 1. Nothing
// refetches on focus or reconnect: page 1 alone would push its last file onto
// a cached page 2 that lacks it. Pages in the cache aren't asked for again
// when the hook mounts; a bare mutate() refetches every loaded page, keeping
// the files shown until they answer.
export const useMediaLibrary = (
  query: MediaLibraryQuery
): {
  files: MediaLibraryRow[];
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | undefined;
  mutate: SWRInfiniteKeyedMutator<MediaLibraryPage[]>;
} => {
  const fetch = useFetch();
  const getKey = (index: number) => {
    const params = new URLSearchParams({ page: String(index + 1) });
    if (query.type) {
      params.set('type', query.type);
    }
    if (query.sort === 'oldest') {
      params.set('sort', 'oldest');
    }
    if (query.search.trim()) {
      params.set('search', query.search.trim());
    }
    return `/media?${params.toString()}`;
  };

  // A failed answer (a 500 has a JSON body too) is an error SWR asks again
  // for, never a page to show
  const load = useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error('Failed to load the files');
      }
      return response.json();
    },
    [fetch]
  );

  const { data, size, setSize, mutate, error, isLoading } = useSWRInfinite<
    MediaLibraryPage,
    Error
  >(getKey, load, {
    parallel: true,
    revalidateFirstPage: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const files = useMemo(
    () =>
      uniqBy(
        (data || []).flatMap((page) => page.results),
        'id'
      ),
    [data]
  );
  const loadMore = useCallback(() => {
    setSize(size + 1);
  }, [setSize, size]);

  return {
    files,
    // the last answer says how many pages the list holds now
    hasMore: !!data?.length && data.length < data[data.length - 1].pages,
    loadMore,
    isLoading,
    // a page asked for that hasn't answered; a failed one isn't loading
    isLoadingMore: !error && !!data && data.length < size,
    error,
    mutate,
  };
};

// One refetch for the list and its month counts (research R4): every loaded
// page of the list for this query, through its own mutate(), and every month
// heading's count, so the two can't be refetched apart. A key filter alone
// revalidates each count and keeps it shown until it answers.
export const useRefreshMediaLibrary = (
  query: MediaLibraryQuery
): (() => Promise<void>) => {
  const { mutate } = useMediaLibrary(query);
  const { mutate: mutateKeys } = useSWRConfig();
  return useCallback(async () => {
    await Promise.all([
      mutate(),
      mutateKeys(
        (key) => typeof key === 'string' && key.startsWith('/media/month?')
      ),
    ]);
  }, [mutate, mutateKeys]);
};
