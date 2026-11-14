import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import useSWR, { SWRConfig } from 'swr';

// Spec 057 (research R4, contracts/ui.md "MediaMonth"). How many files a month
// holds under the list's type and search, for its heading: one count per
// heading, from GET /media/month. A count never refetches on its own (focus,
// reconnect) while its month's files don't, but a heading that mounts over a
// cached count asks again, as the list's pages do when MediaBox mounts. A
// failed answer is an error SWR asks again for, never a count to show.
//
// SWR runs for real on a cache of its own; the double around it only records
// what the hook hands it. Only the request is stubbed.

const mockFetch = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('swr', () => {
  const actual = jest.requireActual('swr');
  return { ...actual, __esModule: true, default: jest.fn(actual.default) };
});

import {
  MediaLibraryQuery,
  useMediaMonthCount,
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

// Mounts the probe on a cache of its own. The render it answers takes the
// heading away (false) and brings it back (true) over that same cache.
const mount = async (query: MediaLibraryQuery) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const cache = new Map();
  const render = async (shown: boolean) => {
    await act(async () => {
      root.render(
        <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
          {shown && <Probe query={query} />}
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
