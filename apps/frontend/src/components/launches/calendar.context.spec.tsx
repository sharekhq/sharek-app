// The calendar's channel filter on an old ?customer= link (spec 051, R7, C5
// and C24). The channel list is the filter, so a link that named a customer
// starts selectedChannels as that customer's channels, with every disabled
// channel kept in since a disabled row can't be ticked, and the server-side
// customer filter stays empty. Nothing resets the start, and once it's read
// the address drops customer, so remounting the calendar shows everything.
//
// The provider is rendered for real with its data-layer modules stubbed, as
// calendar.render.gate.spec.tsx does, and a probe records the context value at
// every render, so a start that only appears after a first frame of every
// channel, or is wiped after it, fails.
import { ContextType, FC, act, useContext } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Every key the provider asked SWR for, with its fetcher, and what the grid's
// request answers.
const mockIsGrid = (key: string | null) =>
  !!key && key.startsWith('/posts-') && !key.startsWith('/posts-list-');
const mockSwrCalls: Array<{
  key: string | null;
  fetcher: () => Promise<unknown>;
}> = [];
let mockGridPosts: unknown[] = [];
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null, fetcher: () => Promise<unknown>) => {
    mockSwrCalls.push({ key, fetcher });
    return {
      data: mockIsGrid(key) ? { posts: mockGridPosts } : undefined,
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

// The address as the page has it now, so a rewrite shows on the next render.
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

let mockSavedView = 'week';
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [mockSavedView, () => undefined],
}));

import {
  CalendarContext,
  CalendarWeekProvider,
  Integrations,
} from '@gitroom/frontend/components/launches/calendar.context';

// A channel as GET /integrations/list gives it, with the fields the filter reads.
const channel = (id: string, customer: string | null, disabled = false) => ({
  id,
  name: id,
  identifier: 'instagram',
  picture: '',
  type: 'social',
  disabled,
  inBetweenSteps: false,
  customer: customer ? { id: customer, name: `Client ${customer}` } : null,
});

// Two customers and the channels with none, each with a disabled channel.
const CHANNELS = [
  channel('shop', 'c1'),
  channel('cafe', 'c1'),
  channel('old-shop', 'c1', true),
  channel('studio', 'c2'),
  channel('old-studio', 'c2', true),
  channel('own', null),
  channel('old-own', null, true),
];
// Client c1's channels and every disabled one (C5).
const C1_START = ['shop', 'cafe', 'old-shop', 'old-studio', 'old-own'];

// a post on each channel
const POSTS = CHANNELS.map((c) => ({
  id: `post-${c.id}`,
  integration: { id: c.id },
  publishDate: '2026-11-11T10:00:00.000Z',
}));
const postsOf = (channelIds: string[]) =>
  channelIds.map((id) => `post-${id}`).sort();
const ALL_POSTS = postsOf(CHANNELS.map((c) => c.id));

// An address the calendar wrote before spec 051, with a parameter of the
// page's own beside the calendar's.
const linkTo = (customer: string | null, display = 'week') =>
  '/launches?' +
  [
    'startDate=2026-11-09',
    'endDate=2026-11-15',
    `display=${display}`,
    customer ? `customer=${customer}` : '',
    'added=instagram',
  ]
    .filter((p) => p)
    .join('&');

// The context at every render.
const contexts: Array<ContextType<typeof CalendarContext>> = [];
const latest = () => contexts[contexts.length - 1];
const Probe: FC = () => {
  contexts.push(useContext(CalendarContext));
  return null;
};

// A selection as a set, since its order means nothing; null stays null.
const asSet = (ids: string[] | null) => ids && new Set(ids);
const selections = () => contexts.map((c) => asSet(c.selectedChannels));
const shown = () => {
  const ids = latest().posts.map((p) => p.id);
  return ids.sort();
};

const mounted: Root[] = [];
const calendar = () => (
  <CalendarWeekProvider integrations={CHANNELS as unknown as Integrations[]}>
    <Probe />
  </CalendarWeekProvider>
);
const mount = async () => {
  contexts.length = 0;
  mockSwrCalls.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(calendar());
  });
  return root;
};
const open = (address: string) => {
  window.history.replaceState(null, '', address);
  return mount();
};

// The first request of each kind the provider made, and its query.
const firstGrid = () => mockSwrCalls.find((c) => mockIsGrid(c.key))!;
const firstGridQuery = () =>
  new URLSearchParams(firstGrid().key!.slice('/posts-'.length));
const firstListQuery = () => {
  const key = mockSwrCalls
    .map((c) => c.key)
    .find((k) => !!k && k.startsWith('/posts-list-'))!;
  return new URLSearchParams(key.slice('/posts-list-'.length));
};

beforeEach(() => {
  mockGridPosts = POSTS;
});

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
  window.history.replaceState(null, '', '/');
  mockSavedView = 'week';
});

describe('an old ?customer= link (R7, C5)', () => {
  it("starts selectedChannels as that customer's channels plus every disabled one", async () => {
    await open(linkTo('c1'));

    expect(asSet(contexts[0].selectedChannels)).toEqual(new Set(C1_START));
    expect(shown()).toEqual(postsOf(C1_START));
  });

  it.each(['c1', 'unknown'])(
    'sends customer= empty in the first grid request on ?customer=%s',
    async (customer) => {
      mockFetched.length = 0;
      await open(linkTo(customer));

      expect(latest().customer).toBeNull();
      expect(firstGridQuery().get('customer')).toBe('');

      await firstGrid().fetcher();
      const asked = new URL(
        mockFetched.find((url) => url.startsWith('/posts?'))!,
        'http://localhost'
      ).searchParams;
      expect(asked.get('customer')).toBe('');
    }
  );

  it("asks the list for the customer's channels from its first request, with customer= empty", async () => {
    mockSavedView = 'list';
    await open(linkTo('c1', 'list'));

    const query = firstListQuery();
    expect(query.get('customer')).toBe('');
    expect(new Set(query.get('integrations')?.split(','))).toEqual(
      new Set(C1_START)
    );
  });

  it('keeps the start through the first renders, nothing resetting it', async () => {
    const root = await open(linkTo('c1'));
    // the page renders again once the address has changed
    await act(async () => {
      root.render(calendar());
    });

    expect(contexts.length).toBeGreaterThan(1);
    expect(selections()).toEqual(contexts.map(() => new Set(C1_START)));
    expect(shown()).toEqual(postsOf(C1_START));
  });

  it.each([
    ['an unknown customer', linkTo('unknown')],
    ['no customer', linkTo(null)],
  ])('starts at null on %s', async (_name, address) => {
    await open(address);

    expect(selections()).toEqual(contexts.map(() => null));
    expect(shown()).toEqual(ALL_POSTS);
  });

  it('shows everything again on setSelectedChannels(null), and resets the list page, as today', async () => {
    await open(linkTo('c1'));
    expect(shown()).toEqual(postsOf(C1_START));
    await act(async () => {
      latest().setListPage(3);
    });
    expect(latest().listPage).toBe(3);

    await act(async () => {
      latest().setSelectedChannels(null);
    });

    expect(latest().selectedChannels).toBeNull();
    expect(shown()).toEqual(ALL_POSTS);
    expect(latest().listPage).toBe(0);
  });
});

describe('the address once the start is read (C24)', () => {
  it('drops customer, keeps the rest in the same history entry, and a remount starts at null', async () => {
    const entries = window.history.length;
    const root = await open(linkTo('c1'));

    expect(window.location.pathname).toBe('/launches');
    const address = new URLSearchParams(window.location.search);
    expect(Object.fromEntries(address)).toEqual({
      startDate: '2026-11-09',
      endDate: '2026-11-15',
      display: 'week',
      added: 'instagram',
    });
    expect(window.history.length).toBe(entries);

    // update(true) remounts the provider (launches.component.tsx)
    act(() => root.unmount());
    await mount();

    expect(selections()).toEqual(contexts.map(() => null));
    expect(shown()).toEqual(ALL_POSTS);
  });
});
