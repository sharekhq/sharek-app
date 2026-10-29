import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import i18next from 'i18next';

// A month chip at 1025px and below is the channel avatar alone, with no room
// for the post's ⋮ button. A finger held still on it opens the same menu Week
// and Day open from that button. A tap still opens the post, and holding then
// moving still drags it: the menu waits past the touch backend's 400ms pickup
// (dnd.provider.tsx), any move cancels it, and a drag that begins closes it.
// The release that ends a hold is not a tap.
//
// The real calendar pipeline runs here (DNDProvider, react-dnd and the touch
// backend), so a drag is the one a finger starts. The rest is the scenery of
// calendar.month.compact.spec.tsx.
const mockCalendar = {
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  display: 'month',
  integrations: [] as Array<Record<string, unknown>>,
  posts: [] as unknown[],
  loading: false,
  sets: [] as unknown[],
  signature: undefined as unknown,
  changeDate: jest.fn(),
  reloadCalendarView: jest.fn(),
  currentHour: dayjs(),
  postDates: new Map<object, dayjs.Dayjs>(),
};
// What the calendar asks the server for: opening a post fetches its group.
const mockFetched: string[] = [];
const mockFetch = async (url: string) => {
  mockFetched.push(url);
  return { json: async () => ({}) };
};

jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({
    data: undefined,
    isLoading: false,
    mutate: () => undefined,
  }),
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: (_key: string, initial: string) => [initial, () => undefined],
}));
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  ...jest.requireActual(
    '@gitroom/frontend/components/launches/calendar.context'
  ),
  useCalendar: () => mockCalendar,
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

import '@gitroom/frontend/components/layout/html.component';
import {
  fromUtc,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import {
  MonthView,
  WeekView,
} from '@gitroom/frontend/components/launches/calendar';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis,
// and isUSCitizen reads it.
globalThis.localStorage = window.localStorage;

// The window, as the media query reports it: 1025px or narrower unless a case
// widens it.
const realMatchMedia = window.matchMedia;
let smallWindow = true;

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en: { translation: {} } } });
  // what a drag under way reaches for: happy-dom has no elementsFromPoint,
  // and Jest's node environment no MutationObserver, nor the Image the html5
  // backend's empty preview is
  document.elementsFromPoint = () => [];
  Object.assign(globalThis, {
    MutationObserver: window.MutationObserver,
    Image: window.Image,
  });
});

// Wednesday 21 October 2026 at 13:37, local time
const WEDNESDAY = new Date(2026, 9, 21, 13, 37);
// Friday 23 October 2026 at 10:00, local time: a day still to come
const FRIDAY_TEN = new Date(2026, 9, 23, 10, 0);

const post = {
  id: 'p1',
  group: 'g-p1',
  content: '<p>post p1</p>',
  publishDate: dayjs(FRIDAY_TEN).utc().format(),
  state: 'QUEUE',
  error: null as string | null,
  releaseURL: null as string | null,
  releaseId: null as string | null,
  intervalInDays: null as number | null,
  integration: {
    id: 'i1',
    picture: '/pic.jpg',
    providerIdentifier: 'x',
    name: 'X',
  },
  tags: [] as unknown[],
};

const mounted: Array<{ unmount: () => void }> = [];

const render = async (node: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<DNDProvider>{node}</DNDProvider>);
  });
  return host;
};

beforeEach(() => {
  jest.useFakeTimers({ now: WEDNESDAY });
  Object.assign(mockCalendar, {
    display: 'month',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  });
  mockCalendar.currentHour = dayjs(WEDNESDAY).startOf('hour');
  mockCalendar.posts = [post];
  mockCalendar.postDates = new Map([
    [post, fromUtc(post.publishDate)] as [object, dayjs.Dayjs],
  ]);
  mockFetched.length = 0;
  localStorage.setItem('isUS', 'GLOBAL');
  smallWindow = true;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  jest.useRealTimers();
  window.matchMedia = realMatchMedia;
  setUserTimezone(null);
});

// The post's chip, and the avatar a finger lands on.
const chip = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('.shadow-soft')!;
const avatar = (host: HTMLElement) =>
  chip(host).querySelector<HTMLElement>('img[src="/pic.jpg"]')!;
const menu = () => document.querySelector('[role="menu"]');
const items = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((n) =>
    (n.textContent || '').trim()
  );
const dragging = (host: HTMLElement) => chip(host).style.opacity === '0';
const opened = () => mockFetched.includes(`/posts/group/${post.group}`);

const touch = (
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: HTMLElement,
  clientY: number
) => {
  const point = new window.Touch({
    identifier: 1,
    target,
    clientX: 20,
    clientY,
  });
  // a finger that lifts or is cancelled is no longer on the screen
  const down = type === 'touchstart' || type === 'touchmove' ? [point] : [];
  const event = new window.TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: down,
    targetTouches: down,
    changedTouches: [point],
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });

// what the browser sends for a tap: a click, once the finger lifts
const tap = async (target: HTMLElement) => {
  touch('touchstart', target, 100);
  wait(100);
  const end = touch('touchend', target, 100);
  if (!end.defaultPrevented) {
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }
};

describe('a month chip held by a finger at 1025px and below', () => {
  it('opens the post on a quick tap', async () => {
    const host = await render(<MonthView />);

    await tap(avatar(host));

    expect(opened()).toBe(true);
    expect(menu()).toBeNull();
  });

  it("opens the post's menu after a still hold of 500ms, and the release opens nothing", async () => {
    const host = await render(<MonthView />);

    touch('touchstart', avatar(host), 100);
    wait(499);
    expect(menu()).toBeNull();
    wait(1);
    expect(menu()).not.toBeNull();
    expect(items()).toEqual(['Duplicate Post', 'Preview Post', 'Delete Post']);

    // a cancelled touchend is what keeps the browser from clicking
    expect(touch('touchend', avatar(host), 100).defaultPrevented).toBe(true);
    expect(menu()).not.toBeNull();
    expect(opened()).toBe(false);
  });

  // A past post's chip is drawn grey through a filter, and a filter makes the
  // element the box a `fixed` list is placed in and greys whatever is inside:
  // the menu hangs from the chip, outside the grey.
  it("opens a past post's menu in colour, placed against the screen", async () => {
    const MONDAY_TEN = new Date(2026, 9, 19, 10, 0);
    const past = { ...post, publishDate: dayjs(MONDAY_TEN).utc().format() };
    mockCalendar.posts = [past];
    mockCalendar.postDates = new Map([
      [past, fromUtc(past.publishDate)] as [object, dayjs.Dayjs],
    ]);
    const host = await render(<MonthView />);

    touch('touchstart', avatar(host), 100);
    wait(500);

    expect(menu()).not.toBeNull();
    expect(menu()!.closest('[class*="grayscale"]')).toBeNull();
  });

  it('drags on a hold then a move, and opens no menu', async () => {
    const host = await render(<MonthView />);

    touch('touchstart', avatar(host), 100);
    wait(400);
    touch('touchmove', avatar(host), 140);
    expect(dragging(host)).toBe(true);
    wait(1000);
    expect(menu()).toBeNull();
  });

  it('closes the menu when the finger moves on and the drag begins', async () => {
    const host = await render(<MonthView />);

    touch('touchstart', avatar(host), 100);
    wait(500);
    expect(menu()).not.toBeNull();
    touch('touchmove', avatar(host), 140);

    expect(dragging(host)).toBe(true);
    expect(menu()).toBeNull();
  });

  it('closes the menu on Escape, and on a tap outside it', async () => {
    const host = await render(<MonthView />);

    touch('touchstart', avatar(host), 100);
    wait(500);
    touch('touchend', avatar(host), 100);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(menu()).toBeNull();

    touch('touchstart', avatar(host), 100);
    wait(500);
    touch('touchend', avatar(host), 100);
    expect(menu()).not.toBeNull();
    touch('touchstart', document.body, 400);
    expect(menu()).toBeNull();
  });

  it('chooses an action from the menu without opening the post', async () => {
    const host = await render(<MonthView />);
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);

    touch('touchstart', avatar(host), 100);
    wait(500);
    touch('touchend', avatar(host), 100);
    const preview = [...document.querySelectorAll('[role="menuitem"]')].find(
      (n) => n.textContent?.includes('Preview Post')
    )!;
    await act(async () => {
      preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(open).toHaveBeenCalledWith('/p/p1?share=true', '_blank');
    expect(menu()).toBeNull();
    expect(opened()).toBe(false);
    open.mockRestore();
  });

  // Above 1025px the month card is the full card, with the ⋮ button in its
  // strip; the held menu is not drawn there at all.
  it('keeps a long press above 1025px as it was, with no menu', async () => {
    smallWindow = false;
    const host = await render(<MonthView />);
    const overlay = chip(host).querySelector('.pointer-events-none');

    expect(overlay!.className.split(' ')).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block'])
    );
    touch('touchstart', avatar(host), 100);
    wait(1000);
    expect(touch('touchend', avatar(host), 100).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it('adds nothing to a week card: a hold there opens no menu', async () => {
    Object.assign(mockCalendar, {
      display: 'week',
      startDate: '2026-10-19',
      endDate: '2026-10-25',
    });
    const host = await render(<WeekView />);

    expect(chip(host).querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(
      1
    );
    touch('touchstart', avatar(host), 100);
    wait(1000);
    expect(touch('touchend', avatar(host), 100).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
    expect(chip(host).querySelector('.pointer-events-none')).toBeNull();
  });
});
