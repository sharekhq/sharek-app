import { act, FC } from 'react';
import { createRoot, Root } from 'react-dom/client';
import useSWR, { SWRConfig, useSWRConfig } from 'swr';

// Spec 057 (research R4, contracts/ui.md "MediaMonth"). How many files a month
// holds under the list's type and search, for its heading: one count per
// heading, from GET /media/month. A count never refetches on its own (focus,
// reconnect) while its month's files don't, but a heading that mounts over a
// cached count asks again, as the list's pages do when MediaBox mounts. A
// failed answer is an error SWR asks again for, never a count to show.
//
// useMediaLibrary (research R2): the list, offset pages of GET /media loaded
// one after another as the user scrolls, flattened and each file once. Loading
// more never refetches page 1, nothing refetches on focus or reconnect, and a
// hook that mounts over cached pages asks for none of them (MediaBox asks).
//
// useRefreshMediaLibrary (research R4): one function that refetches the list
// and its month counts together after an upload or an import, so the two
// can't be refetched apart: the list's mutate() for the same query, and one
// revalidation of every /media/month? key and of no other.
//
// SWR runs for real on a cache of its own; the doubles around useSWR and
// useSWRInfinite only record what the hooks hand them. Only the request is
// stubbed.

const mockFetch = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return {
    ...actual,
    __esModule: true,
    default: jest.fn(actual.default),
    useSWRConfig: jest.fn(actual.useSWRConfig),
  };
});
jest.mock('swr/infinite', () => {
  const actual = jest.requireActual('swr/infinite');
  return { ...actual, __esModule: true, default: jest.fn(actual.default) };
});

import useSWRInfinite from 'swr/infinite';
import {
  MediaLibraryQuery,
  useMediaLibrary,
  useMediaMonthCount,
  useRefreshMediaLibrary,
} from '@gitroom/frontend/components/media/use.media.library';

// November 2026 in New York, as UTC instants: the month's start and the next
// month's start.
const november = { from: '2026-11-01T04:00:00Z', to: '2026-12-01T05:00:00Z' };
const all: MediaLibraryQuery = { sort: 'newest', search: '' };

const mounted: Root[] = [];
// What the hook gave on each render. SWR renders again only for what a render
// reads, so the probe reads data and error as a heading does.
const captured: Array<
  Pick<ReturnType<typeof useMediaMonthCount>, 'data' | 'error'>
> = [];

const answers = (count: number) =>
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ count }),
  });

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  captured.length = 0;
  jest.clearAllMocks();
});

const Probe = ({ query }: { query: MediaLibraryQuery }) => {
  const { data, error } = useMediaMonthCount(query, november);
  captured.push({ data, error });
  return null;
};

const settle = async () => {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
};

// Mounts a probe (the month count's unless a case gives another) on a cache of
// its own. The render it answers takes the probe away (false) and brings it
// back (true) over that same cache.
const mount = async (
  query: MediaLibraryQuery,
  Component: FC<{ query: MediaLibraryQuery }> = Probe
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const cache = new Map();
  const render = async (shown: boolean) => {
    await act(async () => {
      root.render(
        <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
          {shown && <Component query={query} />}
        </SWRConfig>
      );
    });
    await settle();
  };
  await render(true);
  return render;
};

const swrCalls = () => (useSWR as unknown as jest.Mock).mock.calls;

// The key as its parts, in order, so the order is pinned and the encoding
// isn't.
const parts = (key: string) => {
  const [path, search] = key.split('?');
  return { path, params: Array.from(new URLSearchParams(search).entries()) };
};

describe('useMediaMonthCount', () => {
  it('asks GET /media/month with the month, then the type and the trimmed search, in that order', async () => {
    answers(23);

    await mount({ type: 'video', sort: 'newest', search: '  ramadan eid  ' });

    const key = swrCalls()[0][0];
    expect(parts(key)).toEqual({
      path: '/media/month',
      params: [
        ['from', november.from],
        ['to', november.to],
        ['type', 'video'],
        ['search', 'ramadan eid'],
      ],
    });
    expect(mockFetch).toHaveBeenCalledWith(key);
  });

  it('leaves out the type when there is none and the search when it is blank', async () => {
    answers(23);

    await mount({ sort: 'newest', search: '   ' });

    const key = swrCalls()[0][0];
    expect(parts(key)).toEqual({
      path: '/media/month',
      params: [
        ['from', november.from],
        ['to', november.to],
      ],
    });
  });

  it('never sends the order: a month holds the same files either way', async () => {
    answers(23);

    await mount({ type: 'image', sort: 'oldest', search: 'eid' });

    const key = swrCalls()[0][0];
    expect(parts(key).params).toEqual([
      ['from', november.from],
      ['to', november.to],
      ['type', 'image'],
      ['search', 'eid'],
    ]);
  });

  it('makes one SWR call on each render', async () => {
    answers(23);

    await mount(all);

    expect(captured.length).toBeGreaterThan(1);
    expect(swrCalls()).toHaveLength(captured.length);
  });

  it('never refetches on focus or reconnect, and leaves its mount revalidation on', async () => {
    answers(23);

    await mount(all);

    const options = swrCalls()[0][2];
    expect(options).toEqual(
      expect.objectContaining({
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      })
    );
    expect(options.revalidateIfStale).not.toBe(false);
    expect(options.revalidateOnMount).not.toBe(false);
  });

  it('gives the count GET /media/month answers', async () => {
    answers(23);

    await mount(all);

    const result = captured[captured.length - 1];
    expect(result.data).toEqual({ count: 23 });
    expect(result.error).toBeUndefined();
  });

  it('asks again when a heading mounts over a cached count, showing the cached one meanwhile', async () => {
    answers(23);
    const render = await mount(all);
    await render(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    answers(24);
    captured.length = 0;
    await render(true);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(captured[0].data).toEqual({ count: 23 });
    expect(captured[captured.length - 1].data).toEqual({ count: 24 });
  });

  it('gives no count and an error for a 500 with a JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        statusCode: 500,
        message: 'Internal server error',
      }),
    });

    await mount(all);

    const result = captured[captured.length - 1];
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
  });
});

type Row = { id: string; name: string; path: string; createdAt: string };
type Page = { pages: number; results: Row[] };

// A file of the library, mid-month.
const row = (id: string): Row => ({
  id,
  name: `${id}.png`,
  path: `https://media/${id}.png`,
  createdAt: '2026-11-10T12:00:00.000Z',
});
const ids = (files: Array<{ id: string }>) => files.map((file) => file.id);

// GET /media as a case's server answers it: page n is pages[n - 1]. The pages
// numbered in `failing` answer a 500 with a JSON body, and while a case holds
// the gate every answer waits for it to open.
const server: {
  pages: Page[];
  failing: Set<number>;
  gate?: Promise<void>;
  open: () => void;
} = { pages: [], failing: new Set(), open: () => {} };

const pageOf = (path: string) =>
  Number(new URLSearchParams(path.split('?')[1]).get('page'));

const serve = (pages: Page[]) => {
  server.pages = pages;
  mockFetch.mockImplementation(async (path: string) => {
    await server.gate;
    const page = pageOf(path);
    if (server.failing.has(page)) {
      return {
        ok: false,
        status: 500,
        json: async () => ({
          statusCode: 500,
          message: 'Internal server error',
        }),
      };
    }
    return { ok: true, status: 200, json: async () => server.pages[page - 1] };
  });
};
// The rows as pages, each answer counting them all.
const servePages = (...pages: Row[][]) =>
  serve(pages.map((results) => ({ pages: pages.length, results })));

const hold = () => {
  server.gate = new Promise<void>((resolve) => {
    server.open = () => {
      server.gate = undefined;
      resolve();
    };
  });
};
const open = async () => {
  await act(async () => {
    server.open();
  });
  await settle();
};

// The pages asked for, in order.
const asked = () =>
  mockFetch.mock.calls.map(([path]: [string]) => pageOf(path));

type Library = ReturnType<typeof useMediaLibrary>;
// What the hook gave on each render, and its last answer whole.
const library: {
  renders: Array<
    Pick<Library, 'files' | 'hasMore' | 'isLoading' | 'isLoadingMore' | 'error'>
  >;
  latest?: Library;
} = { renders: [] };
const last = () => library.renders[library.renders.length - 1];

const LibraryProbe = ({ query }: { query: MediaLibraryQuery }) => {
  const result = useMediaLibrary(query);
  const { files, hasMore, isLoading, isLoadingMore, error } = result;
  library.renders.push({ files, hasMore, isLoading, isLoadingMore, error });
  library.latest = result;
  return null;
};

const loadMore = async () => {
  await act(async () => {
    library.latest!.loadMore();
  });
  await settle();
};

const infiniteCalls = () => (useSWRInfinite as unknown as jest.Mock).mock.calls;

describe('useMediaLibrary', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    server.failing = new Set();
    server.gate = undefined;
    library.renders = [];
    library.latest = undefined;
  });

  it('asks GET /media for page index + 1, then the type, sort=oldest and the trimmed search, in that order', async () => {
    servePages([row('a')]);

    await mount(
      { type: 'video', sort: 'oldest', search: '  ramadan eid  ' },
      LibraryProbe
    );

    const getKey = infiniteCalls()[0][0];
    expect(parts(getKey(0, null))).toEqual({
      path: '/media',
      params: [
        ['page', '1'],
        ['type', 'video'],
        ['sort', 'oldest'],
        ['search', 'ramadan eid'],
      ],
    });
    expect(parts(getKey(2, null)).params).toEqual([
      ['page', '3'],
      ['type', 'video'],
      ['sort', 'oldest'],
      ['search', 'ramadan eid'],
    ]);
    expect(mockFetch).toHaveBeenCalledWith(getKey(0, null));
  });

  it('leaves out the type when there is none, the sort when it is newest and the search when it is blank', async () => {
    servePages([row('a')]);

    await mount({ sort: 'newest', search: '   ' }, LibraryProbe);

    const getKey = infiniteCalls()[0][0];
    expect(parts(getKey(0, null))).toEqual({
      path: '/media',
      params: [['page', '1']],
    });
    expect(parts(getKey(1, null)).params).toEqual([['page', '2']]);
  });

  it('loads pages side by side, never refetches page 1 to load more, and never refetches on focus or reconnect', async () => {
    servePages([row('a')]);

    await mount(all, LibraryProbe);

    expect(infiniteCalls()[0][2]).toEqual(
      expect.objectContaining({
        parallel: true,
        revalidateFirstPage: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      })
    );
  });

  it('makes one useSWRInfinite call on each render', async () => {
    servePages([row('a')]);

    await mount(all, LibraryProbe);

    expect(library.renders.length).toBeGreaterThan(1);
    expect(infiniteCalls()).toHaveLength(library.renders.length);
  });

  it('gives the pages loaded flattened in order, each file once, loadMore asking for the next page only', async () => {
    // A file added between two loads pushes c onto page 2 as well.
    servePages(
      [row('a'), row('b'), row('c')],
      [row('c'), row('d')],
      [row('e')]
    );

    await mount(all, LibraryProbe);
    expect(ids(last().files)).toEqual(['a', 'b', 'c']);

    await loadMore();
    expect(ids(last().files)).toEqual(['a', 'b', 'c', 'd']);

    await loadMore();
    expect(ids(last().files)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(asked()).toEqual([1, 2, 3]);
  });

  it('has more while fewer pages are loaded than the last answer counts', async () => {
    // A file deleted elsewhere between the loads: page 2 counts two pages.
    serve([
      { pages: 3, results: [row('a')] },
      { pages: 2, results: [row('b')] },
      { pages: 2, results: [row('c')] },
    ]);

    await mount(all, LibraryProbe);
    expect(last().hasMore).toBe(true);

    await loadMore();
    expect(last().hasMore).toBe(false);
  });

  it('has no more after a single page', async () => {
    servePages([row('a')]);

    await mount(all, LibraryProbe);

    expect(ids(last().files)).toEqual(['a']);
    expect(last().hasMore).toBe(false);
  });

  it('is loading until the first page answers, and loading more while a further page is asked for', async () => {
    servePages([row('a')], [row('b')]);
    hold();

    await mount(all, LibraryProbe);
    expect(last()).toEqual(
      expect.objectContaining({
        files: [],
        isLoading: true,
        isLoadingMore: false,
      })
    );

    await open();
    expect(ids(last().files)).toEqual(['a']);
    expect(last().isLoading).toBe(false);
    expect(last().isLoadingMore).toBe(false);

    hold();
    await loadMore();
    expect(ids(last().files)).toEqual(['a']);
    expect(last().isLoading).toBe(false);
    expect(last().isLoadingMore).toBe(true);

    await open();
    expect(ids(last().files)).toEqual(['a', 'b']);
    expect(last().isLoadingMore).toBe(false);
  });

  it('keeps the files loaded and gives an error when a further page fails with a 500 and a JSON body', async () => {
    servePages([row('a')], [row('b')], [row('c')]);
    server.failing.add(2);

    await mount(all, LibraryProbe);
    await loadMore();

    expect(ids(last().files)).toEqual(['a']);
    expect(last().error).toBeInstanceOf(Error);
    expect(last().isLoadingMore).toBe(false);
    expect(last().hasMore).toBe(true);
  });

  it('gives no files and an error when the first page fails', async () => {
    servePages([row('a')]);
    server.failing.add(1);

    await mount(all, LibraryProbe);

    expect(last().files).toEqual([]);
    expect(last().error).toBeInstanceOf(Error);
    expect(last().isLoading).toBe(false);
  });

  it('refetches every loaded page on mutate(), showing the files loaded until they answer', async () => {
    servePages([row('a')], [row('b')]);
    await mount(all, LibraryProbe);
    await loadMore();
    mockFetch.mockClear();
    // An upload since: the new file leads page 1 and pushes a onto page 2.
    servePages([row('new'), row('a')], [row('a'), row('b')]);
    hold();

    await act(async () => {
      library.latest!.mutate();
    });
    await settle();
    expect(ids(last().files)).toEqual(['a', 'b']);
    expect([...asked()].sort()).toEqual([1, 2]);

    await open();
    expect(ids(last().files)).toEqual(['new', 'a', 'b']);
  });

  it('mounts over cached pages showing them at once, and asks for none of them on its own', async () => {
    servePages([row('a')], [row('b')]);
    const render = await mount(all, LibraryProbe);
    await loadMore();
    await render(false);
    mockFetch.mockClear();
    library.renders = [];

    await render(true);

    expect(ids(library.renders[0].files)).toEqual(['a', 'b']);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useRefreshMediaLibrary', () => {
  const refresh: { latest?: () => Promise<void> } = {};
  const RefreshProbe = ({ query }: { query: MediaLibraryQuery }) => {
    refresh.latest = useRefreshMediaLibrary(query);
    return null;
  };
  // The Media page as the hooks see it: the list, a month heading and the
  // refresh, over one cache.
  const Library = ({ query }: { query: MediaLibraryQuery }) => (
    <>
      <LibraryProbe query={query} />
      <Probe query={query} />
      <RefreshProbe query={query} />
    </>
  );
  // The server answers the pages and, for any month, a count.
  const serveWithCounts = (...pages: Row[][]) => {
    servePages(...pages);
    const answerPage = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (path: string) =>
      path.startsWith('/media/month?')
        ? { ok: true, status: 200, json: async () => ({ count: 2 }) }
        : answerPage(path)
    );
  };
  const runRefresh = async () => {
    await act(async () => {
      await refresh.latest!();
    });
    await settle();
  };

  beforeEach(() => {
    mockFetch.mockReset();
    server.failing = new Set();
    server.gate = undefined;
    library.renders = [];
    library.latest = undefined;
    refresh.latest = undefined;
  });
  afterEach(() => {
    (useSWRInfinite as unknown as jest.Mock).mockImplementation(
      jest.requireActual('swr/infinite').default
    );
    (useSWRConfig as unknown as jest.Mock).mockImplementation(
      jest.requireActual('swr').useSWRConfig
    );
  });

  it('refetches every loaded page of the list and the month count shown, once each', async () => {
    serveWithCounts([row('a')], [row('b')]);
    await mount(all, Library);
    await loadMore();
    mockFetch.mockClear();

    await runRefresh();

    expect(
      mockFetch.mock.calls
        .map(([path]: [string]) =>
          path.startsWith('/media/month?') ? 'month' : `page ${pageOf(path)}`
        )
        .sort()
    ).toEqual(['month', 'page 1', 'page 2']);
  });

  it("calls the list's mutate() once, on useMediaLibrary's key for the same query", async () => {
    const query: MediaLibraryQuery = {
      type: 'video',
      sort: 'oldest',
      search: '  ramadan  ',
    };
    servePages([row('a')]);
    await mount(query, LibraryProbe);
    const libraryKey = infiniteCalls()[0][0];
    (useSWRInfinite as unknown as jest.Mock).mockClear();
    const listMutate = jest.fn(async () => undefined);
    const actual = jest.requireActual('swr/infinite').default;
    (useSWRInfinite as unknown as jest.Mock).mockImplementation(
      (...args: unknown[]) => ({ ...actual(...args), mutate: listMutate })
    );

    await mount(query, RefreshProbe);
    await runRefresh();

    const refreshKey = infiniteCalls()[0][0];
    expect(refreshKey(0, null)).toBe(libraryKey(0, null));
    expect(refreshKey(1, null)).toBe(libraryKey(1, null));
    expect(listMutate).toHaveBeenCalledTimes(1);
    expect(listMutate).toHaveBeenCalledWith();
  });

  it('revalidates once every /media/month? key and no other, keeping the counts shown', async () => {
    const query: MediaLibraryQuery = {
      type: 'video',
      sort: 'newest',
      search: 'eid',
    };
    serveWithCounts([row('a')]);
    const globalMutate = jest.fn(async () => []);
    const actual = jest.requireActual('swr').useSWRConfig;
    (useSWRConfig as unknown as jest.Mock).mockImplementation(() => ({
      ...actual(),
      mutate: globalMutate,
    }));
    await mount(query, Library);
    // useSWRInfinite runs through useSWR too, with its getKey
    const monthKey = swrCalls()
      .map(([key]) => key)
      .find((key) => typeof key === 'string');

    await runRefresh();

    expect(globalMutate).toHaveBeenCalledTimes(1);
    // A key filter alone: no data, so each count revalidates and stays shown
    expect(globalMutate.mock.calls[0]).toHaveLength(1);
    const [matches] = globalMutate.mock.calls[0] as unknown as [
      (key?: unknown) => boolean
    ];
    expect(matches(monthKey)).toBe(true);
    expect(
      matches(`/media/month?${new URLSearchParams(november).toString()}`)
    ).toBe(true);
    [
      '/media?page=1',
      '/media?page=2&type=video&search=eid',
      `/media/month/ids?${new URLSearchParams(november).toString()}`,
      '/brands',
      ['/media/month?from=x', 1],
      undefined,
      null,
    ].forEach((key) => expect(matches(key)).toBe(false));
  });
});
