import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream opens a post's live address from the calendar. The merge
// kept upstream's `openPost` and Sharek's own post menu, so Open Post is a
// menu action here: offered where there is an address to open, and opening a
// tab inside the click that chose it, before the server is asked for the
// address, so a popup blocker still sees the user's gesture.
//
// When there is nothing to open, the tab opened in the click is closed again
// and a message says why: TikTok has not released the link yet (also when the
// request fails or takes longer than five seconds), the post has no public
// link (only-me and friends-only posts), or the channel has to be reconnected.
//
// The real ListView renders the card and its menu; everything around them is
// scenery.
type ListPost = Record<string, unknown>;
type Tab = { opener: unknown; location: { href: string }; close: jest.Mock };

const calendar = {
  integrations: [] as unknown[],
  loading: false,
  listPosts: [] as ListPost[],
  listState: 'all',
  reloadCalendarView: jest.fn(),
};
const order: string[] = [];
let releaseReply: Record<string, unknown> = { releaseURL: '' };
let releaseFails = false;
// the server never answers, for the five-second limit
let releaseHangs = false;
const mockFetch = jest.fn(async (url: string) => {
  order.push(`fetch ${url}`);
  if (releaseFails) {
    throw new Error('network');
  }
  if (releaseHangs) {
    return new Promise<never>(() => undefined);
  }
  return { json: async () => releaseReply };
});
const mockToast = jest.fn();

jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  CalendarContext: jest.requireActual('react').createContext({}),
  useCalendar: () => calendar,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({}),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ disableXAnalytics: false }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({
    openModal: () => undefined,
    closeCurrent: () => undefined,
  }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));
jest.mock('react-dnd', () => ({
  useDrop: () => [{}, jest.fn()],
}));
jest.mock('@gitroom/frontend/components/launches/calendar.drag.layer', () => ({
  usePostCardDrag: () => ({ attach: () => undefined, opacity: 1 }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({ useAddProvider: () => () => undefined })
);
jest.mock('@gitroom/frontend/components/launches/statistics', () => ({
  StatisticsModal: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/missing-release.modal',
  () => ({
    MissingReleaseModal: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/creation.method.badge',
  () => ({
    CreationMethodBadge: () => null,
  })
);
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));

import { ListView } from '@gitroom/frontend/components/launches/calendar';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals onto
// globalThis and that is not one of them, so the list's date heading
// (isUSCitizen) would throw during render.
globalThis.localStorage = window.localStorage;

const post = (fields: ListPost = {}): ListPost => ({
  id: 'p1',
  group: 'g1',
  content: '<p>hello</p>',
  publishDate: '2099-01-01T10:00:00.000Z',
  state: 'PUBLISHED',
  releaseURL: 'https://x.com/a/status/1',
  releaseId: 'r1',
  intervalInDays: null,
  integration: { id: 'i1', picture: '', providerIdentifier: 'x', name: 'X' },
  tags: [],
  ...fields,
});

// A TikTok post whose link TikTok gives out late: the profile address until then
const tiktok = (fields: ListPost = {}): ListPost =>
  post({
    releaseURL: 'https://www.tiktok.com/@sharek',
    releaseId: 'v_pub_url~123',
    integration: {
      id: 'i2',
      picture: '',
      providerIdentifier: 'tiktok',
      name: 'TikTok',
    },
    ...fields,
  });

const mounted: Array<{ unmount: () => void }> = [];

const mount = async (listed: ListPost) => {
  calendar.listPosts = [listed];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<ListView />);
  });
  return host;
};

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const openMenu = async (host: HTMLElement) => {
  await click(host.querySelector('[aria-haspopup="menu"]')!);
};

const items = () => Array.from(document.querySelectorAll('[role="menuitem"]'));
const labels = () => items().map((node) => (node.textContent || '').trim());
const item = (label: string) =>
  items().find((node) => (node.textContent || '').includes(label))!;

// The tab is answered before the request resolves; one more tick lets the
// address land in it.
const settle = async () => {
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
};

const NOT_READY =
  'The post link is not available yet, please try again in a minute';

let tab: Tab;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  order.length = 0;
  mockFetch.mockClear();
  mockToast.mockClear();
  releaseReply = { releaseURL: '' };
  releaseFails = false;
  releaseHangs = false;
  tab = { opener: { sharek: true }, location: { href: '' }, close: jest.fn() };
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => {
    order.push('open');
    return tab as unknown as Window;
  });
});

afterEach(() => {
  jest.useRealTimers();
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  openSpy.mockRestore();
  setUserTimezone(null);
});

describe('Open Post', () => {
  it('is offered on a published post with a live address, right after Preview', async () => {
    await openMenu(await mount(post()));

    expect(labels()).toEqual([
      'Duplicate Post',
      'Preview Post',
      'Open Post',
      'Post Statistics',
      'Delete Post',
    ]);
  });

  it.each([
    ['a failed post that holds an address', true, { state: 'ERROR' }],
    [
      'a failed post without an address',
      false,
      { state: 'ERROR', releaseURL: null },
    ],
    ['a scheduled post', false, { state: 'QUEUE' }],
    ['a draft', false, { state: 'DRAFT' }],
    // A recurring post's address is its last run's, so it has none of its own.
    ['a recurring post', false, { intervalInDays: 7 }],
    ['an address that is not a web address', false, { releaseURL: 'missing' }],
  ])('on %s, offered: %s', async (_name, offered, fields) => {
    await openMenu(await mount(post(fields)));

    expect(labels().includes('Open Post')).toBe(offered);
  });

  it('opens the tab inside the click, before asking the server, and severs its opener', async () => {
    releaseReply = {
      releaseURL: 'https://reddit.com/r/a/1,https://reddit.com/r/b/2',
    };
    await openMenu(await mount(post()));

    await click(item('Open Post'));
    await settle();

    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(order).toEqual(['open', 'fetch /posts/p1/release-url']);
    expect(tab.opener).toBeNull();
    // A post published to several places joins their addresses with commas.
    expect(tab.location.href).toBe('https://reddit.com/r/a/1');
    expect(tab.close).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('opens the address the server resolved, a TikTok photo page', async () => {
    releaseReply = {
      releaseURL: 'https://www.tiktok.com/@sharek/photo/7420000000000000001',
      pending: false,
      unavailable: false,
    };
    await openMenu(await mount(tiktok()));

    await click(item('Open Post'));
    await settle();

    expect(tab.location.href).toBe(
      'https://www.tiktok.com/@sharek/photo/7420000000000000001'
    );
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('falls back to the stored address when the server answers without one', async () => {
    await openMenu(
      await mount(
        post({ releaseURL: 'https://a.example/1,https://b.example/2' })
      )
    );

    await click(item('Open Post'));
    await settle();

    expect(tab.location.href).toBe('https://a.example/1');
  });

  it.each([
    [
      'the platform has not released the link yet',
      { releaseURL: 'https://www.tiktok.com/@sharek', pending: true },
      NOT_READY,
    ],
    [
      'the post has no public link',
      { releaseURL: 'https://www.tiktok.com/@sharek', unavailable: true },
      'This post has no public link',
    ],
    [
      'the channel has to be reconnected',
      { releaseURL: 'https://www.tiktok.com/@sharek', reconnect: true },
      'Reconnect this channel to open the post link',
    ],
  ])(
    'when %s, closes the tab and says so instead of opening the profile',
    async (_name, reply, message) => {
      releaseReply = reply;
      await openMenu(await mount(tiktok()));

      await click(item('Open Post'));
      await settle();

      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(tab.location.href).toBe('');
      expect(mockToast).toHaveBeenCalledWith(message, 'warning');
    }
  );

  it('says the link is not ready when the server cannot answer', async () => {
    releaseFails = true;
    await openMenu(await mount(tiktok()));

    await click(item('Open Post'));
    await settle();

    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('');
    expect(mockToast).toHaveBeenCalledWith(NOT_READY, 'warning');
  });

  it('waits five seconds for the server, then says the link is not ready', async () => {
    releaseHangs = true;
    await openMenu(await mount(tiktok()));
    jest.useFakeTimers();

    await click(item('Open Post'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4999);
    });
    expect(tab.close).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(NOT_READY, 'warning');
  });

  it('asks nothing when the browser blocks the tab', async () => {
    openSpy.mockImplementation(() => null);
    await openMenu(await mount(post()));

    await click(item('Open Post'));

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// The agenda dates its groups and its cards with fromUtc, Sharek's card
// (calendar.post.card.tsx) included.
describe('the agenda with a zone chosen', () => {
  const ZONE = 'Asia/Tokyo';

  beforeEach(() => {
    setUserTimezone(ZONE);
    localStorage.setItem('isUS', 'GLOBAL');
  });

  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('files a post under its day in the zone, at its time there', async () => {
    // 16:30 UTC on the 21st is 01:30 on the 22nd in Tokyo
    const host = await mount(post({ publishDate: '2099-10-21T16:30:00.000Z' }));

    expect(host.textContent).toContain('22 October 2099');
    expect(host.textContent).toContain('01:30');
    expect(host.textContent).not.toContain('21 October 2099');
  });

  // A post dragged to another slot is dated as UTC without the Z until the
  // calendar reloads (calendar.context.tsx's changeDate); it is still UTC.
  it('reads a moved post, dated without the Z, as UTC', async () => {
    const host = await mount(post({ publishDate: '2099-10-21T16:30:00' }));

    expect(host.textContent).toContain('22 October 2099');
    expect(host.textContent).toContain('01:30');
    expect(host.textContent).not.toContain('16:30');
  });
});
