// The bell's popup: a notification's text is never markup, its date follows
// the account's zone and the interface language, and the list is read fresh on
// each opening, with nothing marked new while it reloads. The header counts the
// new ones and each new row carries a dot, both in the brand colour.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// Scenery: the bell's click-away hook ships ESM only. The ref it hands back is
// what the bell's wrapper has to hold for a click outside to close the popup.
const mockClickAway = { current: null as HTMLDivElement | null };
jest.mock('@uidotdev/usehooks', () => ({ useClickAway: () => mockClickAway }));
// The bell's own count, read apart from the list, and what a click writes back.
type MockCount = { data?: { total: number }; mutate: jest.Mock };
let mockCount: MockCount = { mutate: jest.fn() };
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
    key === 'notifications-list'
      ? mockCount
      : mockUseSWR(key, fetcher, options),
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
import NotificationComponent, {
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
  mockCount = { mutate: jest.fn() };
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

// On small screens (≤1025px) the popup spans the header, flush under it and
// 8px in from its sides; on desktop it hangs 10px under the bell, 420px wide,
// as before. The header is the popup's containing block there, so the bell
// gives up its own positioning.
describe('where the popup sits', () => {
  const classesOf = (el: Element) => el.className.split(/\s+/);

  it('spans the header on small screens and keeps its desktop size and look', async () => {
    const host = await render(<NotificationOpenComponent />);
    const popup = classesOf(host.querySelector('#notification-popup')!);

    expect(popup).toEqual(
      expect.arrayContaining([
        'mobile:mt-0',
        'mobile:w-auto',
        'mobile:start-[8px]',
        'mobile:!end-[8px]',
        'w-[420px]',
        'rounded-[16px]',
        'shadow-card',
      ])
    );
    expect(popup.filter((c) => c.startsWith('phone:w-'))).toEqual([]);
  });

  it('lets the header place it on small screens, the bell on desktop', async () => {
    mockList = { isLoading: false, isValidating: false };
    const host = await render(<NotificationComponent />);

    expect(classesOf(host.firstElementChild!)).toEqual(
      expect.arrayContaining(['relative', 'mobile:static'])
    );
  });

  it('sets a row in 14px on a 20px line, under a bold header, with 11px times', async () => {
    mockList = {
      data: {
        lastReadNotifications: '2026-10-20T10:00:00.000Z',
        notifications: [
          { createdAt: '2026-10-21T09:00:00.000Z', content: 'Posted' },
        ],
      },
      isLoading: false,
      isValidating: false,
    };
    const host = await render(<NotificationOpenComponent />);

    expect(classesOf(body(host))).toEqual(
      expect.arrayContaining(['text-[14px]', 'leading-[20px]'])
    );
    expect(classesOf(time(host))).toContain('text-[11px]');
    expect(
      classesOf(host.querySelector('#notification-popup')!.firstElementChild!)
    ).toContain('font-bold');
  });
});

// The bell in the top bar: one button, named by the popup it opens, in the dark
// mode button's 40px box (research R9). Its wrapper still places the popup and
// holds the click-away ref, and the popup opens beside the button, never in it.
describe('the bell', () => {
  // The menu button's box (layout.component.tsx), centred, as mode.component.tsx
  // carries it.
  const BOX = [
    'flex',
    'items-center',
    'justify-center',
    'h-[40px]',
    'w-[40px]',
    'coarse:h-[44px]',
    'coarse:w-[44px]',
    'rounded-[10px]',
    'text-textItemBlur',
    'hover:text-newTextColor',
    'hover:bg-boxFocused',
    'transition-colors',
    'focus-visible:ring-2',
    'focus-visible:ring-brand',
  ];
  const BELL =
    'M14 21H10M18 8C18 6.4087 17.3679 4.88258 16.2427 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.8826 2.63214 7.75738 3.75736C6.63216 4.88258 6.00002 6.4087 6.00002 8C6.00002 11.0902 5.22049 13.206 4.34968 14.6054C3.61515 15.7859 3.24788 16.3761 3.26134 16.5408C3.27626 16.7231 3.31488 16.7926 3.46179 16.9016C3.59448 17 4.19261 17 5.38887 17H18.6112C19.8074 17 20.4056 17 20.5382 16.9016C20.6852 16.7926 20.7238 16.7231 20.7387 16.5408C20.7522 16.3761 20.3849 15.7859 19.6504 14.6054C18.7795 13.206 18 11.0902 18 8Z';

  const buttonIn = (host: HTMLElement) => {
    const buttons = host.querySelectorAll<HTMLElement>('button');
    if (buttons.length !== 1) throw new Error(`${buttons.length} buttons`);
    return buttons[0];
  };

  const press = async (el: HTMLElement) => {
    await act(async () => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  it('is a button that submits nothing, named by the popup it opens', async () => {
    const host = await render(<NotificationComponent />);
    const button = buttonIn(host);

    expect(button.parentElement).toBe(host.firstElementChild);
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Notifications');
  });

  it('says the popup is closed, then open once a click opens it', async () => {
    const host = await render(<NotificationComponent />);
    const button = buttonIn(host);

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('#notification-popup')).toBeNull();

    await press(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#notification-popup')).not.toBeNull();
  });

  it("carries the dark mode button's 40px box, centred", async () => {
    const host = await render(<NotificationComponent />);
    const classes = buttonIn(host).className.split(/\s+/);

    BOX.forEach((name) => expect(classes).toContain(name));
  });

  // The hover colour is the button's now, so the drawing carries no class.
  it('shows the 24px bell, hidden from the accessibility tree', async () => {
    const host = await render(<NotificationComponent />);
    const svgs = buttonIn(host).querySelectorAll('svg');

    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute('aria-hidden')).toBe('true');
    expect(svgs[0].getAttribute('class')).toBeNull();
    expect(svgs[0].getAttribute('width')).toBe('24');
    expect(svgs[0].getAttribute('height')).toBe('24');
    expect(svgs[0].getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svgs[0].querySelector('path')!.getAttribute('d')).toBe(BELL);
  });

  it('draws the unread dot as before while some are unread', async () => {
    mockCount = { data: { total: 2 }, mutate: jest.fn() };
    const host = await render(<NotificationComponent />);
    const dots = buttonIn(host).querySelectorAll('svg circle');

    expect(dots).toHaveLength(1);
    expect(
      ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'].map((name) =>
        dots[0].getAttribute(name)
      )
    ).toEqual(['17.0625', '5', '4', 'var(--brand)', 'var(--bg)', '2']);
  });

  it('draws no dot when nothing is unread', async () => {
    mockCount = { data: { total: 0 }, mutate: jest.fn() };
    const host = await render(<NotificationComponent />);

    expect(buttonIn(host).querySelector('circle')).toBeNull();
  });

  it('keeps the wrapper that places the popup and holds the click-away ref', async () => {
    const host = await render(<NotificationComponent />);
    const wrapper = host.firstElementChild!;

    expect(wrapper.getAttribute('class')).toBe(
      'relative mobile:static cursor-pointer select-none coarse:min-w-[44px] coarse:min-h-[44px] coarse:flex coarse:items-center coarse:justify-center'
    );
    expect(mockClickAway.current).toBe(wrapper);
  });

  // A button may hold no interactive content, and the popup's links are.
  it('opens the popup beside the button, so a click inside it leaves it open', async () => {
    const host = await render(<NotificationComponent />);
    const button = buttonIn(host);
    await press(button);
    const popup = host.querySelector<HTMLElement>('#notification-popup')!;

    expect(popup.parentElement).toBe(button.parentElement);
    expect(button.contains(popup)).toBe(false);

    await press(popup);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#notification-popup')).toBe(popup);
  });
});
