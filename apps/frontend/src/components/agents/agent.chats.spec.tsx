import { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig } from 'swr';

// Samy's chats panel (spec 051, contracts/pages-ui.md's Samy part, R14): the
// header with Hide chats on the rail and Close on the drawer, New chat, the
// search, and the chats grouped Pinned, Today, Yesterday, Previous 7 days and
// Older in the user's time zone, each row with its ⋯ for Rename and Pin. SWR
// runs for real on a cache of its own, so a rename or a pin is seen landing in
// the `threads` cache; only the requests are stubbed. The test DOM has no
// layout, so sizes are pinned by the classes that carry them, and useT gives
// the key, so each case names the string it expects.
type Chat = { id: string; title: string; pinned: boolean; updatedAt: string };

const mockFetch = jest.fn();
const mockToast = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
// The address of a chat started from New chat keeps the word `new` (C21).
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'new' }),
  usePathname: () => '/agents/new',
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { AlreadyAnsweredError } from '@gitroom/helpers/utils/custom.fetch.func';
import {
  browserTimezone,
  setUserTimezone,
} from '@gitroom/frontend/components/layout/set.timezone';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import {
  ChatsPanel,
  useChats,
} from '@gitroom/frontend/components/agents/agent.chats';

const ZONE = 'Asia/Tokyo';
// Sunday 8 November 2026 at 16:00 UTC: already Monday the 9th at 01:00 in
// Tokyo, still Sunday on every machine west of it
const NOW = new Date(Date.UTC(2026, 10, 8, 16, 0));

const chat = (
  id: string,
  title: string,
  updatedAt: string,
  pinned = false
): Chat => ({ id, title, pinned, updatedAt });

// As GET /copilot/list answers: last used first. The comments give Tokyo's
// wall clock.
const LIST: Chat[] = [
  // 9 Nov 00:55
  chat('pin-new', 'Cold brew launch plan', '2026-11-08T15:55:00.000Z', true),
  // 9 Nov 00:50 and 00:10, one not named yet
  chat('today-1', 'Weekly posts for Noor Dental', '2026-11-08T15:50:00.000Z'),
  chat('today-2', '', '2026-11-08T15:10:00.000Z'),
  // 8 Nov 23:00, which is today on the machine's clock, and 8 Nov 00:00
  chat(
    'yesterday-1',
    'Rawda Florist: weekend offers',
    '2026-11-08T14:00:00.000Z'
  ),
  chat('yesterday-2', 'عروض نهاية الأسبوع', '2026-11-07T15:00:00.000Z'),
  // 7 Nov 23:59, 2 days ago, and 2 Nov 00:00, 7 days ago
  chat('week-1', 'LinkedIn hiring post', '2026-11-07T14:59:00.000Z'),
  chat('week-2', 'Café plans', '2026-11-01T15:00:00.000Z'),
  // 1 Nov 23:59, 8 days ago
  chat('older-1', 'Q3 report summary', '2026-11-01T14:59:00.000Z'),
  // pinned weeks ago
  chat('pin-old', 'Ramadan campaign ideas', '2026-10-01T09:00:00.000Z', true),
  chat('older-2', 'Spring Menu', '2026-09-20T09:00:00.000Z'),
];

// What the list answers, and how each PUT does.
let mockList: Chat[];
let mockPut: () => Promise<unknown>;

const answer = (status: number, body: unknown = {}) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const deferred = () => {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const mockHide = jest.fn();
const mockClose = jest.fn();
let cache: Map<string, unknown>;
// the list's own mutate, to revalidate it as the chat header will
let refresh: () => Promise<unknown>;
const Refresh = () => {
  const { mutate } = useChats();
  useEffect(() => {
    refresh = mutate;
  }, [mutate]);
  return null;
};

const mounted: Root[] = [];

const settle = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
};

const render = async (threadId = '') => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <PropertiesContext.Provider
          value={{
            properties: [],
            threadId,
            hideChats: mockHide,
            closeChats: mockClose,
          }}
        >
          <ChatsPanel />
          <Refresh />
        </PropertiesContext.Provider>
      </SWRConfig>
    );
  });
  await settle();
  return host;
};

const classes = (node: Element) => node.className.split(/\s+/);

const tap = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
};

const press = async (node: Element, key: string) => {
  await act(async () => {
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  await settle();
};

const type = async (input: HTMLInputElement, text: string) => {
  // React tracks the last value it wrote, so assigning `.value` directly looks
  // like no change at all; the native setter is what moves the tracker.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    'value'
  )?.set;
  await act(async () => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const linkOf = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLAnchorElement>(`a[href="/agents/${id}"]`);
const rowOf = (host: HTMLElement, id: string) =>
  linkOf(host, id)!.parentElement!;
// the element that holds a row's title
const titleOf = (host: HTMLElement, id: string) =>
  linkOf(host, id)!.querySelector('[dir="auto"]')!;
const chatLinks = (root: Element) =>
  Array.from(root.querySelectorAll('a')).filter(
    (a) => a.getAttribute('href') !== '/agents/new'
  );
// each group's name and its rows' titles, in order
const groups = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="group"]')).map((group) => [
    group.getAttribute('aria-label'),
    chatLinks(group).map((a) => a.textContent),
  ]);
const search = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input[type="search"]')!;
const field = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input:not([type="search"])');
const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;
const options = (host: HTMLElement, id: string) =>
  rowOf(host, id).querySelector('[aria-label="chat_options"]')!;
const menuItems = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="menuitem"]'));
const choose = async (host: HTMLElement, id: string, label: string) => {
  await tap(options(host, id));
  await tap(menuItems(host).find((item) => item.textContent === label)!);
};
// the requests other than the list's
const puts = () =>
  mockFetch.mock.calls
    .filter(([url]) => url !== '/copilot/list')
    .map(([url, options]) => [
      url,
      options.method,
      JSON.parse(options.body as string),
    ]);

const rename = async (host: HTMLElement, id: string, text: string) => {
  await choose(host, id, 'rename');
  await type(field(host)!, text);
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  setUserTimezone(ZONE);
  cache = new Map();
  mockList = LIST;
  mockPut = async () => answer(200);
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) =>
    url === '/copilot/list'
      ? Promise.resolve(answer(200, { threads: mockList }))
      : mockPut()
  );
  mockToast.mockReset();
  mockHide.mockReset();
  mockClose.mockReset();
});

afterEach(() => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
  setUserTimezone(null);
  jest.useRealTimers();
});

describe('the chats', () => {
  it('runs on a machine outside the chosen zone', () => {
    expect(browserTimezone()).not.toBe(ZONE);
  });

  it('reads GET /copilot/list into the threads key', async () => {
    await render();

    expect(mockFetch).toHaveBeenCalledWith('/copilot/list');
    expect((cache.get('threads') as { data: unknown }).data).toEqual({
      threads: LIST,
    });
  });

  it("groups them by last use in the user's time zone, each group newest first", async () => {
    const host = await render();

    expect(groups(host)).toEqual([
      ['pinned_chats', ['Cold brew launch plan', 'Ramadan campaign ideas']],
      ['chats_today', ['Weekly posts for Noor Dental', 'new_chat']],
      [
        'chats_yesterday',
        ['Rawda Florist: weekend offers', 'عروض نهاية الأسبوع'],
      ],
      ['chats_previous_7_days', ['LinkedIn hiring post', 'Café plans']],
      ['chats_older', ['Q3 report summary', 'Spring Menu']],
    ]);
  });

  it("doesn't show a group with no chats", async () => {
    mockList = [LIST[1], LIST[9]];
    const host = await render();

    expect(groups(host)).toEqual([
      ['chats_today', ['Weekly posts for Noor Dental']],
      ['chats_older', ['Spring Menu']],
    ]);
  });
});

describe('the search', () => {
  it('is a search field for chats, in its own direction', async () => {
    const host = await render();
    const input = search(host);

    expect(input.getAttribute('aria-label')).toBe('search_chats');
    expect(input.getAttribute('placeholder')).toBe('search_chats');
    expect(input.getAttribute('dir')).toBe('auto');
  });

  it('keeps the titles that contain the text, ignoring case and accents', async () => {
    const host = await render();

    await type(search(host), 'CAFE');
    expect(groups(host)).toEqual([['chats_previous_7_days', ['Café plans']]]);

    await type(search(host), ' menu ');
    expect(groups(host)).toEqual([['chats_older', ['Spring Menu']]]);
    expect(host.textContent).not.toContain('no_chat_matches');
  });

  it('matches what a row shows, New chat for a chat not yet named', async () => {
    const host = await render();

    await type(search(host), 'NEW');

    expect(groups(host)).toEqual([['chats_today', ['new_chat']]]);
  });

  it('takes a chat the list gives no title at all as one not yet named', async () => {
    mockList = [
      { ...chat('nameless', '', '2026-11-08T15:30:00.000Z'), title: undefined },
      ...LIST,
    ] as Chat[];
    const host = await render();
    expect(titleOf(host, 'nameless').textContent).toBe('new_chat');

    await type(search(host), 'cafe');
    expect(groups(host)).toEqual([['chats_previous_7_days', ['Café plans']]]);

    await type(search(host), 'new');
    expect(groups(host)).toEqual([['chats_today', ['new_chat', 'new_chat']]]);
  });

  it('says so when no chat matches', async () => {
    const host = await render();

    await type(search(host), 'nothing like this');

    expect(groups(host)).toEqual([]);
    expect(host.textContent).toContain('no_chat_matches');
  });
});

describe('a row', () => {
  it('holds its title at the list text size, in its own direction, cut at its end', async () => {
    const host = await render();
    const title = titleOf(host, 'yesterday-2');

    expect(title.textContent).toBe('عروض نهاية الأسبوع');
    expect(title.getAttribute('dir')).toBe('auto');
    expect(classes(title)).toEqual(
      expect.arrayContaining(['text-[14px]', 'truncate'])
    );
  });

  it('reads New chat until the chat has a title', async () => {
    const host = await render();

    expect(titleOf(host, 'today-2').textContent).toBe('new_chat');
  });

  it('shows its hover and is 44px tall on a touch screen', async () => {
    const host = await render();

    expect(classes(rowOf(host, 'today-1'))).toContain('hover:bg-boxHover');
    expect(classes(linkOf(host, 'today-1')!)).toEqual(
      expect.arrayContaining(['min-h-[36px]', 'coarse:min-h-[44px]'])
    );
  });

  it('carries a pin mark when pinned, and none otherwise', async () => {
    const host = await render();
    const marks = (id: string) =>
      Array.from(rowOf(host, id).children).filter(
        (node) => node.tagName.toLowerCase() === 'svg'
      );

    expect(marks('pin-new')).toHaveLength(1);
    expect(marks('pin-old')).toHaveLength(1);
    expect(marks('today-1')).toHaveLength(0);
  });

  it("marks the open chat, the one whose id Agent's context holds", async () => {
    const host = await render('today-2');

    expect(linkOf(host, 'today-2')!.getAttribute('aria-current')).toBe('page');
    expect(classes(rowOf(host, 'today-2'))).toContain('bg-brandSoft2');
    expect(
      chatLinks(host).filter((a) => a.hasAttribute('aria-current'))
    ).toHaveLength(1);
    expect(classes(rowOf(host, 'today-1'))).not.toContain('bg-brandSoft2');
  });

  it('marks a chat started at /agents/new once the list has it', async () => {
    const host = await render('fresh');
    expect(
      chatLinks(host).filter((a) => a.hasAttribute('aria-current'))
    ).toHaveLength(0);

    mockList = [
      chat('fresh', 'Spring menu', '2026-11-08T15:59:00.000Z'),
      ...LIST,
    ];
    await act(async () => {
      await refresh();
    });
    await settle();

    expect(linkOf(host, 'fresh')!.getAttribute('aria-current')).toBe('page');
    expect(groups(host)[1]).toEqual([
      'chats_today',
      ['Spring menu', 'Weekly posts for Noor Dental', 'new_chat'],
    ]);
  });

  it('opens its chat and closes the drawer', async () => {
    const host = await render();

    await tap(linkOf(host, 'week-1')!);

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

describe('the ⋯ Chat options', () => {
  it('shows on its row hover, on focus and always on a touch screen', async () => {
    const host = await render();
    const trigger = options(host, 'today-1');

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(classes(rowOf(host, 'today-1'))).toContain('group');
    expect(classes(trigger.parentElement!)).toEqual(
      expect.arrayContaining([
        'opacity-0',
        'group-hover:opacity-100',
        'focus-within:opacity-100',
        'coarse:opacity-100',
      ])
    );
    expect(classes(trigger)).toEqual(
      expect.arrayContaining([
        'w-[28px]',
        'h-[28px]',
        'coarse:w-[44px]',
        'coarse:h-[44px]',
      ])
    );
  });

  it('offers Rename and Pin to top, or Unpin on a pinned chat', async () => {
    const host = await render();

    await tap(options(host, 'today-1'));
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'rename',
      'pin_to_top',
    ]);
    await press(document.body, 'Escape');

    await tap(options(host, 'pin-old'));
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'rename',
      'unpin',
    ]);
  });
});

describe('Rename', () => {
  it('edits the title in place, in its own direction, from the title it has', async () => {
    const host = await render();

    await choose(host, 'today-1', 'rename');
    const input = field(host)!;

    expect(input.value).toBe('Weekly posts for Noor Dental');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(input.getAttribute('aria-label')).toBe('rename');
    expect(document.activeElement).toBe(input);
    expect(linkOf(host, 'today-1')).toBeNull();
  });

  it('saves the trimmed title on Enter, into the threads cache at once', async () => {
    const saving = deferred();
    mockPut = () => saving.promise;
    const host = await render();

    await rename(host, 'today-1', '  Noor: weekly posts  ');
    await press(field(host)!, 'Enter');

    expect(puts()).toEqual([
      ['/copilot/today-1/title', 'PUT', { title: 'Noor: weekly posts' }],
    ]);
    expect(field(host)).toBeNull();
    // before the server answers
    expect(titleOf(host, 'today-1').textContent).toBe('Noor: weekly posts');
    expect(
      (cache.get('threads') as { data: { threads: Chat[] } }).data.threads[1]
        .title
    ).toBe('Noor: weekly posts');

    saving.resolve(answer(200));
    await settle();
    expect(titleOf(host, 'today-1').textContent).toBe('Noor: weekly posts');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('saves when the field loses the focus too', async () => {
    const host = await render();

    await rename(host, 'week-1', 'Hiring post');
    await act(async () => {
      field(host)!.blur();
    });
    await settle();

    expect(puts()).toEqual([
      ['/copilot/week-1/title', 'PUT', { title: 'Hiring post' }],
    ]);
    expect(titleOf(host, 'week-1').textContent).toBe('Hiring post');
  });

  it('cancels on Escape, which closes only the field and not the drawer', async () => {
    const host = await render();
    const heard = jest.fn();
    document.addEventListener('keydown', heard);

    await rename(host, 'today-1', 'Something else');
    await press(field(host)!, 'Escape');
    document.removeEventListener('keydown', heard);

    expect(puts()).toEqual([]);
    expect(field(host)).toBeNull();
    expect(titleOf(host, 'today-1').textContent).toBe(
      'Weekly posts for Noor Dental'
    );
    expect(heard).not.toHaveBeenCalled();
  });

  it('sends nothing for an empty name, and keeps the old title', async () => {
    const host = await render();

    await rename(host, 'today-1', '   ');
    await press(field(host)!, 'Enter');

    expect(puts()).toEqual([]);
    expect(field(host)).toBeNull();
    expect(titleOf(host, 'today-1').textContent).toBe(
      'Weekly posts for Noor Dental'
    );
  });

  it('sends nothing for a name left as it was', async () => {
    const host = await render();

    await rename(host, 'today-1', ' Weekly posts for Noor Dental ');
    await press(field(host)!, 'Enter');

    expect(puts()).toEqual([]);
    expect(field(host)).toBeNull();
  });

  it('shows the error toast on a failed save, and puts the old title back', async () => {
    mockPut = async () => answer(500);
    const host = await render();

    await rename(host, 'today-1', 'Noor: weekly posts');
    await press(field(host)!, 'Enter');

    expect(mockToast).toHaveBeenCalledWith('error_occurred', 'warning');
    expect(titleOf(host, 'today-1').textContent).toBe(
      'Weekly posts for Noor Dental'
    );
  });

  it('does the same when the request never reaches the server', async () => {
    mockPut = async () => {
      throw new TypeError('Failed to fetch');
    };
    const host = await render();

    await rename(host, 'today-1', 'Noor: weekly posts');
    await press(field(host)!, 'Enter');

    expect(mockToast).toHaveBeenCalledWith('error_occurred', 'warning');
    expect(titleOf(host, 'today-1').textContent).toBe(
      'Weekly posts for Noor Dental'
    );
  });

  it('puts the old title back with no toast of its own when the request was already answered', async () => {
    mockPut = async () => {
      throw new AlreadyAnsweredError(402);
    };
    const host = await render();

    await rename(host, 'today-1', 'Noor: weekly posts');
    await press(field(host)!, 'Enter');

    expect(mockToast).not.toHaveBeenCalled();
    expect(titleOf(host, 'today-1').textContent).toBe(
      'Weekly posts for Noor Dental'
    );
  });
});

describe('Pin', () => {
  it('pins the chat, which moves to Pinned at once', async () => {
    const saving = deferred();
    mockPut = () => saving.promise;
    const host = await render();

    await choose(host, 'today-1', 'pin_to_top');

    expect(puts()).toEqual([['/copilot/today-1/pin', 'PUT', { pinned: true }]]);
    expect(groups(host).slice(0, 2)).toEqual([
      [
        'pinned_chats',
        [
          'Cold brew launch plan',
          'Weekly posts for Noor Dental',
          'Ramadan campaign ideas',
        ],
      ],
      ['chats_today', ['new_chat']],
    ]);

    saving.resolve(answer(200));
    await settle();
    expect(groups(host)[0][1]).toHaveLength(3);
  });

  it('unpins it, which returns it to its date group', async () => {
    const host = await render();

    await choose(host, 'pin-old', 'unpin');

    expect(puts()).toEqual([
      ['/copilot/pin-old/pin', 'PUT', { pinned: false }],
    ]);
    expect(groups(host)[0]).toEqual([
      'pinned_chats',
      ['Cold brew launch plan'],
    ]);
    expect(groups(host)[4]).toEqual([
      'chats_older',
      ['Q3 report summary', 'Ramadan campaign ideas', 'Spring Menu'],
    ]);
  });

  it('shows the error toast on a failed pin, and puts the chat back', async () => {
    mockPut = async () => answer(500);
    const host = await render();

    await choose(host, 'today-1', 'pin_to_top');

    expect(mockToast).toHaveBeenCalledWith('error_occurred', 'warning');
    expect(groups(host).slice(0, 2)).toEqual([
      ['pinned_chats', ['Cold brew launch plan', 'Ramadan campaign ideas']],
      ['chats_today', ['Weekly posts for Noor Dental', 'new_chat']],
    ]);
  });
});

describe('the header', () => {
  it('reads Chats, in a block that stays put and takes the top padding SplitPanel lacks', async () => {
    const host = await render();
    const heading = host.querySelector('h2')!;
    const block = heading.parentElement!.parentElement!;

    expect(heading.textContent).toBe('chats');
    expect(classes(block)).toEqual(
      expect.arrayContaining([
        'sticky',
        'top-0',
        'pt-[20px]',
        'bg-newBgColorInner',
      ])
    );
    expect(block.contains(host.querySelector('a[href="/agents/new"]'))).toBe(
      true
    );
    expect(block.contains(search(host))).toBe(true);
  });

  it('starts a new chat with a +, at /agents/new, closing the drawer', async () => {
    const host = await render();
    const link = host.querySelector('a[href="/agents/new"]')!;

    expect(link.textContent).toBe('new_chat');
    expect(link.querySelector('svg')).not.toBeNull();

    await tap(link);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("hides the chats on the rail, through the page's hide", async () => {
    const host = await render();
    const hide = button(host, 'hide_chats');

    expect(classes(hide)).toContain('mobile:hidden');

    await tap(hide);
    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('is Close at 1025px and below, 44px, closing the drawer', async () => {
    const host = await render();
    const close = button(host, 'close');

    expect(classes(close)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex', 'w-[44px]', 'h-[44px]'])
    );

    await tap(close);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockHide).not.toHaveBeenCalled();
  });
});
