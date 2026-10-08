import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream opens a post's live address from the calendar. The merge
// kept upstream's `openPost` and Sharek's own post menu, so Open Post is a
// menu action here: offered where there is an address to open, and opening a
// tab inside the click that chose it, before the server is asked for the
// address, so a popup blocker still sees the user's gesture.
//
// The real ListView renders the card and its menu; everything around them is
// scenery.
type ListPost = Record<string, unknown>;
type Tab = { opener: unknown; location: { href: string } };

const calendar = {
  integrations: [] as unknown[],
  loading: false,
  listPosts: [] as ListPost[],
  listState: 'all',
  reloadCalendarView: jest.fn(),
};
const order: string[] = [];
let releaseReply: { releaseURL: string } = { releaseURL: '' };
let releaseFails = false;
const mockFetch = jest.fn(async (url: string) => {
  order.push(`fetch ${url}`);
  if (releaseFails) {
    throw new Error('network');
  }
  return { json: async () => releaseReply };
});

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
  useToaster: () => ({ show: () => undefined }),
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

let tab: Tab;
let openSpy: jest.SpyInstance;

beforeEach(() => {
  order.length = 0;
  mockFetch.mockClear();
  releaseReply = { releaseURL: '' };
  releaseFails = false;
  tab = { opener: { sharek: true }, location: { href: '' } };
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => {
    order.push('open');
    return tab as unknown as Window;
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  openSpy.mockRestore();
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
  });

  it('falls back to the stored address when the server cannot answer', async () => {
    releaseFails = true;
    await openMenu(
      await mount(
        post({ releaseURL: 'https://a.example/1,https://b.example/2' })
      )
    );

    await click(item('Open Post'));
    await settle();

    expect(tab.location.href).toBe('https://a.example/1');
  });

  it('asks nothing when the browser blocks the tab', async () => {
    openSpy.mockImplementation(() => null);
    await openMenu(await mount(post()));

    await click(item('Open Post'));

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
