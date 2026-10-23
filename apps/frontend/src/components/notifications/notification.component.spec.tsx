// The bell's popup: a notification's text is never markup, its date follows
// the account's zone and the interface language, and the list is read fresh on
// each opening, with nothing marked new while it reloads. The header counts the
// new ones and each new row carries a dot, both in the brand colour.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Scenery: the bell's click-away hook ships ESM only, and nothing under test
// uses it.
jest.mock('@uidotdev/usehooks', () => ({ useClickAway: () => null }));
// The list as SWR hands it to the popup, and what the popup asked SWR for.
type MockList = {
  data?: {
    lastReadNotifications: string;
    notifications: Array<{ createdAt: string; content: string }>;
  };
  isLoading: boolean;
  isValidating: boolean;
};
let mockList: MockList = { isLoading: false, isValidating: false };
const mockUseSWR = jest.fn<
  MockList,
  [string, unknown, Record<string, unknown>?]
>(() => mockList);
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string, fetcher: unknown, options?: Record<string, unknown>) =>
    mockUseSWR(key, fetcher, options),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string, values?: { count?: number }) =>
    fallback.replace('{{count}}', String(values?.count)),
}));

import dayjs from 'dayjs';
import i18next from 'i18next';
import {
  NotificationOpenComponent,
  ShowNotification,
} from '@gitroom/frontend/components/notifications/notification.component';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';
// The row's full date takes its word for the half of the day from the app's
// layout, which every page mounts.
import 'dayjs/locale/ar';
import '@gitroom/frontend/components/layout/html.component';

// The singleton, set up with the pair the Arabic locale ships.
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: {} },
      ar: { translation: { am: 'ص', pm: 'م' } },
    },
  });
});

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockList = { isLoading: false, isValidating: false };
  mockUseSWR.mockClear();
  setUserTimezone(null);
  await i18next.changeLanguage('en');
  dayjs.locale('en');
});

const row = (
  content: string,
  createdAt = '2026-10-21T10:00:00Z',
  newNotification = false
) =>
  render(
    <ShowNotification
      notification={{ createdAt, content }}
      newNotification={newNotification}
    />
  );
// the text of a row, and the time under it
const body = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('.break-words')!;
const time = (host: HTMLElement) => body(host).nextElementSibling!;
// every element that marks something new, in whatever look the bell draws it
const brandMarks = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[class]')).filter((el) =>
    /(^|\s)(bg|border-s)-brand/.test(el.className)
  );
// a row's dot, and the header's count
const dots = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('span.rounded-full'));
const count = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('#notification-popup span.min-w-\\[20px\\]');

// A notification's text embeds channel names and the networks' error
// messages, so it is never markup.
describe('ShowNotification', () => {
  it('shows markup in the text as text', async () => {
    const content =
      'Error posting to <img src=x onerror="document.title=1"> on Bluesky';

    const host = await row(content);

    expect(body(host).querySelector('img')).toBeNull();
    expect(body(host).textContent).toBe(content);
  });

  it('turns an address in the text into a link that opens apart from the app', async () => {
    const url = 'https://www.instagram.com/p/abc123/';

    const host = await row(`Your post is live: ${url} via Sharek`);

    const links = body(host).querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe(url);
    expect(links[0].textContent).toBe(url);
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].className).toBe('cursor-pointer underline font-bold');
    expect(body(host).textContent).toBe(`Your post is live: ${url} via Sharek`);
  });

  it('shows ordinary text unchanged', async () => {
    const content = 'تم نشر منشورك على إنستغرام';

    const host = await row(content);

    expect(body(host).childElementCount).toBe(0);
    expect(body(host).textContent).toBe(content);
  });
});

describe('the date under a notification', () => {
  it('names half past noon as afternoon in Arabic', async () => {
    await i18next.changeLanguage('ar');
    dayjs.locale('ar');

    // Older than a day, so the row shows its full date.
    const host = await row(
      'تم نشر منشورك',
      new Date(2026, 9, 1, 12, 30).toISOString()
    );

    expect(time(host).textContent).toMatch(/12:30 م$/);
  });

  // The bell's two dates go through newDayjs.
  describe('with a zone chosen', () => {
    const ZONE = 'Asia/Tokyo';

    beforeEach(() => setUserTimezone(ZONE));

    it('runs on a machine outside the chosen zone', () => {
      expect(browserTimezone()).not.toBe(ZONE);
    });

    it('shows the time in the zone', async () => {
      // 03:30 UTC is 12:30 in Tokyo
      const host = await row('Your post is live', '2026-10-01T03:30:00.000Z');

      expect(time(host).textContent).toBe('Oct 1, 2026 12:30 PM');
    });

    it('names half past noon in the zone as afternoon in Arabic', async () => {
      await i18next.changeLanguage('ar');
      dayjs.locale('ar');

      const host = await row('تم نشر منشورك', '2026-10-01T03:30:00.000Z');

      expect(time(host).textContent).toBe('أكتوبر 1, 2026 12:30 م');
    });

    it('still says how long ago a recent one came', async () => {
      const host = await row(
        'Your post is live',
        new Date(Date.now() - 3 * 3600_000).toISOString()
      );

      expect(time(host).textContent).toBe('3 hours ago');
    });
  });
});

// The list: read on each opening, never again on focus or reconnect, and
// nothing marked new from the cached list while the fresh one loads.
describe('the list', () => {
  // read up to 20 October; three of the four came after it
  const list = {
    lastReadNotifications: '2026-10-20T10:00:00.000Z',
    notifications: [
      { createdAt: '2026-10-21T09:00:00.000Z', content: 'third' },
      { createdAt: '2026-10-21T08:00:00.000Z', content: 'second' },
      { createdAt: '2026-10-20T12:00:00.000Z', content: 'first' },
      { createdAt: '2026-10-19T12:00:00.000Z', content: 'read' },
    ],
  };

  it('loads fresh at each opening and not on focus or reconnect', async () => {
    mockList = { data: list, isLoading: false, isValidating: false };
    await render(<NotificationOpenComponent />);

    expect(mockUseSWR).toHaveBeenCalledWith(
      'notifications',
      expect.any(Function),
      expect.objectContaining({
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        dedupingInterval: 0,
      })
    );
  });

  it('shows the empty state when the list has nothing', async () => {
    mockList = {
      data: {
        lastReadNotifications: list.lastReadNotifications,
        notifications: [],
      },
      isLoading: false,
      isValidating: false,
    };
    const host = await render(<NotificationOpenComponent />);

    expect(host.textContent).toContain('No notifications');
  });

  it('marks the new ones once the fresh list is in', async () => {
    mockList = { data: list, isLoading: false, isValidating: false };
    const host = await render(<NotificationOpenComponent />);

    expect(brandMarks(host).length).toBeGreaterThan(0);
  });

  it('marks nothing new while the list reloads', async () => {
    // reopening: the cached list, read mark included, is what SWR hands back
    // until the fresh one arrives
    mockList = { data: list, isLoading: false, isValidating: true };
    const host = await render(<NotificationOpenComponent />);

    expect(brandMarks(host)).toEqual([]);
  });

  // the count and the dots, in the brand colour
  it('counts the new ones in the header, white on the brand colour', async () => {
    mockList = { data: list, isLoading: false, isValidating: false };
    const host = await render(<NotificationOpenComponent />);

    expect(count(host)!.textContent).toBe('3');
    expect(count(host)!.className).toContain('bg-brand');
    expect(count(host)!.className).toContain('text-white');
    expect(host.querySelector('.sr-only')!.textContent).toBe(
      '3 new notifications'
    );
  });

  it('puts a brand dot on each new row and none on a read one', async () => {
    mockList = { data: list, isLoading: false, isValidating: false };
    const host = await render(<NotificationOpenComponent />);

    const rows = Array.from(host.querySelectorAll('.break-words')).map(
      (text) => text.parentElement!.parentElement!
    );
    expect(rows.map((r) => dots(r).length)).toEqual([1, 1, 1, 0]);
    dots(host).forEach((dot) => {
      expect(dot.className).toContain('bg-brand');
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('shows no count and no dots when nothing is new', async () => {
    mockList = {
      data: { ...list, lastReadNotifications: '2026-10-22T00:00:00.000Z' },
      isLoading: false,
      isValidating: false,
    };
    const host = await render(<NotificationOpenComponent />);

    expect(count(host)).toBeNull();
    expect(dots(host)).toHaveLength(0);
  });

  // The count follows the title and the dot follows the text, so both sit on
  // the end side in either direction; nothing in the popup is placed left or
  // right, and no colour is written as a hex code (upstream's pink and purple
  // were).
  it('places the count and the dots on the logical end, in no pink', async () => {
    mockList = { data: list, isLoading: false, isValidating: false };
    const host = await render(<NotificationOpenComponent />);

    const header = count(host)!.parentElement!;
    expect(header.firstElementChild!.textContent).toBe('Notifications');
    expect(header.lastElementChild!.className).toBe('sr-only');
    const firstRow =
      host.querySelector('.break-words')!.parentElement!.parentElement!;
    expect(firstRow.lastElementChild).toBe(dots(firstRow)[0]);
    expect(host.innerHTML).not.toMatch(
      /(^|[\s"])(ml|mr|pl|pr|left|right)-|#[0-9a-f]{6}/i
    );
  });
});
