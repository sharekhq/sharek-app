'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  MEDIA_DELETE_BATCH,
  type MediaLibraryDto,
} from '@gitroom/nestjs-libraries/dtos/media/media.library.dto';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Media } from '@prisma/client';
import { chunk, uniqBy } from 'lodash';
import { useCallback, useMemo } from 'react';
import useSWR, { SWRResponse, useSWRConfig } from 'swr';
import useSWRInfinite, { SWRInfiniteKeyedMutator } from 'swr/infinite';

// What the media library lists (data-model.md): the caller's type, else the
// Media page's filter (none = all files), the order, and the search as typed,
// trimmed when it is sent.
export type MediaLibraryQuery = {
  type?: MediaLibraryDto['type'];
  sort: MediaLibraryDto['sort'];
  search: string;
};

// A file of the list (data-model.md): today's row, plus its tile image when
// the storage made one.
export type MediaLibraryRow = Media & { tileImage?: string };

// A page of GET /media: up to 32 files, and how many pages the list holds.
type MediaLibraryPage = { pages: number; results: MediaLibraryRow[] };

// The leading parameters, then what narrows the list: its type, the order
// when it is the oldest first, and its trimmed search, a blank one left out.
// The list's pages and its months build theirs here alike, so the two can't
// ask for different files.
const narrowedParams = (
  leading: Record<string, string>,
  { type, sort, search }: Partial<MediaLibraryQuery>
): URLSearchParams => {
  const params = new URLSearchParams(leading);
  if (type) {
    params.set('type', type);
  }
  if (sort === 'oldest') {
    params.set('sort', 'oldest');
  }
  if (search?.trim()) {
    params.set('search', search.trim());
  }
  return params;
};

// A month's parameters, for its count and its ids alike: the month, then the
// list's type and trimmed search. The order isn't sent: a month holds the same
// files either way.
const monthParams = (
  query: MediaLibraryQuery,
  month: { from: string; to: string }
): URLSearchParams =>
  narrowedParams(
    { from: month.from, to: month.to },
    { type: query.type, search: query.search }
  );

// How many files a month holds under the list's type and search, for its
// heading (GET /media/month, research R4). The month is its start and the next
// month's start in the user's timezone, as UTC instants. A count never
// refetches on focus or reconnect while its month's files don't, but it asks
// again when its heading mounts over a cached one, as the list's pages do.
export const useMediaMonthCount = (
  query: MediaLibraryQuery,
  month: { from: string; to: string }
): SWRResponse<{ count: number }> => {
  const fetch = useFetch();
  const params = monthParams(query, month);

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
// the files shown until they answer, and refresh() the month counts with them.
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
  refresh: () => Promise<void>;
} => {
  const fetch = useFetch();
  const { mutate: mutateKeys } = useSWRConfig();
  const getKey = (index: number) =>
    `/media?${narrowedParams({ page: String(index + 1) }, query).toString()}`;

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
  // One refetch for the list and its month counts (research R4): every loaded
  // page through the list's own mutate(), and every month heading's count, so
  // the two can't be refetched apart. A key filter alone revalidates each
  // count and keeps it shown until it answers.
  const refresh = useCallback(async () => {
    await Promise.all([
      mutate(),
      mutateKeys(
        (key) => typeof key === 'string' && key.startsWith('/media/month?')
      ),
    ]);
  }, [mutate, mutateKeys]);

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
    refresh,
  };
};

// The client's one delete path (DELETE /media, research R6), for the preview's
// Delete and the selection bar: the ids in batches of MEDIA_DELETE_BATCH, the
// most the route takes, one after another. A batch that answers a failure, or
// whose request throws, counts all its files as not deleted and the rest still
// go. Once the last batch answers it says how it went, how many went or how
// many didn't, then resolves to how many weren't deleted; the caller refetches
// the list.
export const useDeleteMedia = (): ((ids: string[]) => Promise<number>) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  return useCallback(
    async (ids: string[]) => {
      let notDeleted = 0;
      for (const batch of chunk(ids, MEDIA_DELETE_BATCH)) {
        try {
          const response = await fetch('/media', {
            method: 'DELETE',
            body: JSON.stringify({ ids: batch }),
          });
          if (!response.ok) {
            notDeleted += batch.length;
          }
        } catch {
          notDeleted += batch.length;
        }
      }
      if (notDeleted) {
        toaster.show(
          t('media_not_deleted', '{{value}} files were not deleted', {
            count: notDeleted,
            value: notDeleted.toLocaleString('en-US'),
          }),
          'warning'
        );
      } else {
        toaster.show(
          t('media_deleted', '{{value}} files deleted', {
            count: ids.length,
            value: ids.length.toLocaleString('en-US'),
          }),
          'success'
        );
      }
      return notDeleted;
    },
    [fetch, toaster, t]
  );
};

// Every file id of a month under the list's type and search, loaded or not,
// for its heading's "Select all" (GET /media/month/ids, research R5). It
// answers a press, so it is a plain request, never an SWR key; a failed answer
// throws.
export const useMonthIds = (): ((
  query: MediaLibraryQuery,
  month: { from: string; to: string }
) => Promise<string[]>) => {
  const fetch = useFetch();
  return useCallback(
    async (query: MediaLibraryQuery, month: { from: string; to: string }) => {
      const response = await fetch(
        `/media/month/ids?${monthParams(query, month).toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to load the month's files");
      }
      const { ids }: { ids: string[] } = await response.json();
      return ids;
    },
    [fetch]
  );
};
