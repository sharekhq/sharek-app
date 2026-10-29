// The view the calendar opens on, and the request it makes for it. A first
// visit opens on Day at 1025px and below (phones and iPads held upright) and
// on Week above, and a view picked once is kept at every width. Until spec 046
// a phone turned Week and Month into the list, which is why its calendar-view
// button did nothing: it saved Week, and the provider turned Week back into
// the list (finding 60 of spec 021 was the first frame of that forcing).
//
// The provider is rendered for real with its data-layer modules stubbed, and a
// probe records the context value at every render. What it asserts is the
// sequence, so a view that only settles on the right answer after a wrong
// first frame (and a wrong first request) fails.
import { ContextType, FC, act, useContext } from 'react';
import { createRoot } from 'react-dom/client';

const swrKeys: Array<string | null> = [];
// What the grid's request answers. Nothing, unless a case puts posts on it.
let gridPosts:
  | Array<{ id: string; integration: { id: string }; publishDate: string }>
  | undefined;
// The grid's fetcher, for the case that reads what it asks the server for.
let mockGridFetcher: (() => Promise<unknown>) | undefined;
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null, fetcher: () => Promise<unknown>) => {
    swrKeys.push(key);
    const grid =
      !!key && key.startsWith('/posts-') && !key.startsWith('/posts-list-');
    if (grid) mockGridFetcher = fetcher;
    return {
      data: grid && gridPosts ? { posts: gridPosts } : undefined,
      isLoading: false,
      mutate: () => undefined,
    };
  },
}));

// The addresses the calendar asked for.
const mockFetched: string[] = [];
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => (url: string) => {
    mockFetched.push(url);
    return Promise.resolve({ json: () => Promise.resolve({ posts: [] }) });
  },
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// The view saved in the cookie. A first visit has none, and the hook then
// answers the default it was given.
let savedView: string | undefined = 'week';
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: (_key: string, initial: string) => [
    savedView ?? initial,
    () => undefined,
  ],
}));

import {
  CalendarContext,
  CalendarWeekProvider,
} from '@gitroom/frontend/components/launches/calendar.context';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

// One entry per render of the consumer: what the calendar would have drawn.
const frames: Array<{ display: string | undefined }> = [];

// The context at every render, for the cases that act on it.
const contexts: Array<ContextType<typeof CalendarContext>> = [];
const latest = () => contexts[contexts.length - 1];

const Probe: FC = () => {
  const context = useContext(CalendarContext);
  contexts.push(context);
  frames.push({ display: context.display });
  return null;
};

const mounted: Array<{ unmount: () => void }> = [];

// Each query is answered for a viewport this wide, as a browser would.
const matchesAt = (width: number, query: string) => {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  return (!max || width <= +max[1]) && (!min || width >= +min[1]);
};

const mountAt = async (width: number) => {
  frames.length = 0;
  contexts.length = 0;
  swrKeys.length = 0;
  window.matchMedia = (query: string) => {
    return {
      media: query,
      matches: matchesAt(width, query),
      onchange: null,
      addEventListener: (): undefined => undefined,
      removeEventListener: (): undefined => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <CalendarWeekProvider integrations={[]}>
        <Probe />
      </CalendarWeekProvider>
    );
  });
};

const postKeys = () => swrKeys.filter((k): k is string => !!k && k.startsWith('/posts'));

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  setUserTimezone(null);
  jest.useRealTimers();
});

describe('the view the calendar opens on', () => {
  afterEach(() => {
    savedView = 'week';
  });

  // The request a view makes from its first render: the grid's for Day, Week
  // and Month, the list's for List, never both.
  const gridKeys = () =>
    postKeys().filter((k) => !k.startsWith('/posts-list-'));
  const listKeys = () => postKeys().filter((k) => k.startsWith('/posts-list-'));

  describe('a first visit with no saved view', () => {
    beforeEach(() => {
      savedView = undefined;
    });

    it.each([390, 820])(
      'opens on Day at %ipx, from the first render',
      async (width) => {
        await mountAt(width);

        expect(frames.length).toBeGreaterThan(0);
        expect(frames.map((f) => f.display)).toEqual(frames.map(() => 'day'));
      }
    );

    it('opens on Week at 1280px', async () => {
      await mountAt(1280);

      expect(frames.length).toBeGreaterThan(0);
      expect(frames.map((f) => f.display)).toEqual(frames.map(() => 'week'));
    });

    it("asks only for the day's grid, never the list", async () => {
      await mountAt(390);

      expect(gridKeys().length).toBeGreaterThan(0);
      expect(gridKeys().every((k) => k.includes('display=day'))).toBe(true);
      expect(listKeys()).toEqual([]);
    });
  });

  it.each(['week', 'month'])(
    'keeps a saved %s at 390px and asks only for its grid',
    async (view) => {
      savedView = view;
      await mountAt(390);

      expect(frames.map((f) => f.display)).toEqual(frames.map(() => view));
      expect(gridKeys().length).toBeGreaterThan(0);
      expect(gridKeys().every((k) => k.includes(`display=${view}`))).toBe(true);
      expect(listKeys()).toEqual([]);
    }
  );

  it('keeps a saved List at 390px and asks only for the list', async () => {
    savedView = 'list';
    await mountAt(390);

    expect(frames.map((f) => f.display)).toEqual(frames.map(() => 'list'));
    expect(listKeys().length).toBeGreaterThan(0);
    expect(gridKeys()).toEqual([]);
  });

  it('leaves the wide viewport on its saved grid, fetching only its own key', async () => {
    await mountAt(1440);

    expect(frames[frames.length - 1].display).toBe('week');
    expect(frames.map((f) => f.display)).not.toContain('list');
    expect(listKeys()).toEqual([]);
    expect(gridKeys().length).toBeGreaterThan(0);
  });

  // The calendar-view button on a phone: it saved Week, and the provider
  // turned Week back into the list, so nothing happened.
  it('opens the week grid when Week is picked from the list at 390px', async () => {
    savedView = 'list';
    await mountAt(390);
    swrKeys.length = 0;

    const { startDate, endDate, customer } = latest();
    await act(async () => {
      latest().setFilters({ startDate, endDate, customer, display: 'week' });
    });

    expect(latest().display).toBe('week');
    expect(gridKeys().some((k) => k.includes('display=week'))).toBe(true);
  });
});

describe('the posts the calendar shows', () => {
  // The channel filter picks the channels the calendar shows, on the
  // grid and in the list alike.
  describe('the channel filter', () => {
    beforeEach(() => {
      gridPosts = [
        {
          id: 'p1',
          integration: { id: 'a' },
          publishDate: '2099-01-01T10:00:00Z',
        },
        {
          id: 'p2',
          integration: { id: 'b' },
          publishDate: '2099-01-01T11:00:00Z',
        },
      ];
    });
    afterEach(() => {
      gridPosts = undefined;
      savedView = 'week';
    });

    it('shows only the picked channels on the grid', async () => {
      await mountAt(1440);
      expect(latest().posts.map((post) => post.id)).toEqual(['p1', 'p2']);

      await act(async () => {
        latest().setSelectedChannels(['b']);
      });

      expect(latest().posts.map((post) => post.id)).toEqual(['p2']);
    });

    it('asks the list for the picked channels', async () => {
      savedView = 'list';
      await mountAt(390);

      await act(async () => {
        latest().setSelectedChannels(['a', 'b']);
      });

      expect(
        postKeys()
          .filter((k) => k.startsWith('/posts-list-'))
          .pop()
      ).toContain('integrations=a%2Cb');
    });
  });
});

describe('the calendar with a zone chosen', () => {
  const ZONE = 'Asia/Tokyo';

  beforeEach(() => {
    setUserTimezone(ZONE);
    // Wednesday 21 October 2026 at 13:37 in Tokyo
    jest.useFakeTimers({ now: new Date(Date.UTC(2026, 9, 21, 4, 37)) });
  });

  afterEach(() => {
    savedView = 'week';
  });

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('dates every post in the zone, once for all the cells', async () => {
    // 01:00 UTC is 10:00 in Tokyo
    gridPosts = [
      { id: 'p1', integration: { id: 'i1' }, publishDate: '2026-10-21T01:00:00.000Z' },
    ];
    await mountAt(1440);

    const { posts, postDates } = latest();
    expect(postDates.get(posts[0])!.format('YYYY-MM-DD HH:mm')).toBe(
      '2026-10-21 10:00'
    );
    gridPosts = undefined;
  });

  it("asks the server for the zone's week", async () => {
    mockFetched.length = 0;
    await mountAt(1440);

    await mockGridFetcher!();

    const asked = new URL(
      mockFetched.find((url) => url.startsWith('/posts?'))!,
      'http://localhost'
    ).searchParams;
    // Monday 19 to Sunday 25 October, midnight to midnight in Tokyo
    expect(asked.get('startDate')).toBe('2026-10-18T15:00:00Z');
    expect(asked.get('endDate')).toBe('2026-10-25T14:59:59Z');
  });

  // Month shows six whole weeks, the end of September and the start of
  // November included. Asking for October alone left those days empty, and a
  // post dropped on one of them vanished when the calendar reloaded.
  it("asks the server for every day the zone's month shows", async () => {
    savedView = 'month';
    mockFetched.length = 0;
    await mountAt(1440);

    await mockGridFetcher!();

    const asked = new URL(
      mockFetched.find((url) => url.startsWith('/posts?'))!,
      'http://localhost'
    ).searchParams;
    // Monday 28 September to Sunday 8 November, midnight to midnight in Tokyo
    expect(asked.get('startDate')).toBe('2026-09-27T15:00:00Z');
    expect(asked.get('endDate')).toBe('2026-11-08T14:59:59Z');
  });
});
