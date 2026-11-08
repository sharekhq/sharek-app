import { act, FC, ReactElement, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';
import { orderBy, uniqBy } from 'lodash';
import { useDragDropManager } from 'react-dnd';

// The channel list that Calendar, Samy and Analytics share (spec 051,
// contracts/channel-panel.md): one order, a header with + and the rail's
// controls, a one-line hint, a search past 6 channels, customer groups that
// remember being closed, rows with a picture, a name in its own direction and
// a second line, and Reconnect and Finish setup beside a row, never inside it.
// These are the parts every mode shares, rendered in calendar mode, the only
// mode increment 2 has, then the calendar's own: ticks, Show all, the row menu,
// the customer pencil and drag. The test DOM has no layout, so sizes are
// pinned by the classes that carry them.
//
// useT gives the key, so each case names the string it expects. The platform
// names come from platformLabel, which reads i18next itself, so i18next runs
// for real on the en and ar files.
const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockOpenModal = jest.fn();
// What each Add Channel or Invite a customer that was chosen was built with.
const mockOpened: unknown[][] = [];
const mockUseAddProvider = jest.fn(
  (...args: unknown[]) =>
    () =>
      mockOpened.push(args)
);
// The signed-in user, for the plan's channel limit.
let mockUser: { totalChannels?: number } = {};
// What the calendar grid's request answers, as calendar.render.gate.spec.tsx
// stubs it: nothing, unless a case puts posts on it.
let mockGridPosts: unknown[] | undefined;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null) => ({
    data:
      !!key &&
      key.startsWith('/posts-') &&
      !key.startsWith('/posts-list-') &&
      mockGridPosts
        ? { posts: mockGridPosts }
        : undefined,
    isLoading: false,
    mutate: () => undefined,
  }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: mockOpenModal }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: (...args: unknown[]) => mockUseAddProvider(...args),
    CustomVariables: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/launches/no-channels.illustration',
  () => ({
    NoChannelsIllustration: () => <i data-testid="no-channels" />,
  })
);

import i18next from 'i18next';
import { CustomVariables } from '@gitroom/frontend/components/launches/add.provider.component';
import { customerHue } from '@gitroom/frontend/components/launches/helpers/customer-hue';
import {
  ChannelPanel,
  compareChannels,
  isUsable,
  orderChannels,
  useReconnectChannel,
} from '@gitroom/frontend/components/launches/channel.panel';
import { DNDProvider } from '@gitroom/frontend/components/launches/helpers/dnd.provider';
import {
  CalendarWeekProvider,
  Integrations,
  useCalendar,
} from '@gitroom/frontend/components/launches/calendar.context';

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: readLocale('en') },
      ar: { translation: readLocale('ar') },
    },
  });
});

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals onto
// globalThis and that is not one of them, so the groups' open state would throw.
globalThis.localStorage = window.localStorage;

// A channel as GET /integrations/list gives it (data-model.md).
type Channel = {
  id: string;
  internalId: string;
  name: string;
  identifier: string;
  picture: string | null;
  type: 'social' | 'article';
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  isCustomFields?: boolean;
  customFields?: unknown[];
  customer: { id: string; name: string } | null;
};

const channel = (id: string, values: Partial<Channel> = {}): Channel => ({
  id,
  internalId: `internal-${id}`,
  name: `Channel ${id}`,
  identifier: 'instagram',
  picture: `/avatar-${id}.png`,
  type: 'social',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
  customer: null,
  ...values,
});

const BAYT = { id: 'c-bayt', name: 'bayt al qahwa' };
const CLIENT_2 = { id: 'c-2', name: 'Client 2' };
const CLIENT_10 = { id: 'c-10', name: 'Client 10' };
const NOOR = { id: 'c-noor', name: 'Noor Dental' };
const RAWDA = { id: 'c-rawda', name: 'روضة للزهور' };

// Out of order on purpose. With no customer: two channels on one platform with
// one name, names that only a numeric, case-blind collation orders (studio 2
// before Studio 10), a disabled social channel and two articles. Customers: a
// lower-case Latin name, Client 2 and Client 10, and an Arabic name.
const ORDER: Channel[] = [
  channel('n-dev-off', {
    name: 'Archive',
    identifier: 'devto',
    type: 'article',
    disabled: true,
  }),
  channel('c10-ig', { name: 'Ten Shop', customer: CLIENT_10 }),
  channel('n-x', { name: 'Zed', identifier: 'x' }),
  channel('rawda-ig', { name: 'روضة للزهور', customer: RAWDA }),
  channel('n-ig-b', { name: 'Lamsa Studio' }),
  channel('bayt-tt', {
    name: 'baytalqahwa',
    identifier: 'tiktok',
    customer: BAYT,
  }),
  channel('n-fb-off', { name: 'Aaa', identifier: 'facebook', disabled: true }),
  channel('c2-li', {
    name: 'Two Shop',
    identifier: 'linkedin',
    customer: CLIENT_2,
  }),
  channel('n-ig-s10', { name: 'Studio 10' }),
  channel('n-dev', { name: 'Blog', identifier: 'devto', type: 'article' }),
  channel('noor-fb', {
    name: 'Noor Dental',
    identifier: 'facebook',
    customer: NOOR,
  }),
  channel('n-ig-a', { name: 'Lamsa Studio' }),
  channel('bayt-fb', {
    name: 'بيت القهوة',
    identifier: 'facebook',
    customer: BAYT,
  }),
  channel('n-fb', { name: 'Mona Saeed', identifier: 'facebook' }),
  channel('c2-ig', { name: 'Two Shop', customer: CLIENT_2 }),
  channel('n-ig-s2', { name: 'studio 2' }),
];

// orderChannels(ORDER), as [customer name, channel ids]: no customer first,
// then customers A to Z with Latin before Arabic, as the 'en' collation puts
// them. Within a group: social before article, enabled before disabled, then
// platform, name and id.
const ORDERED: Array<[string | null, string[]]> = [
  [
    null,
    [
      'n-fb',
      'n-ig-a',
      'n-ig-b',
      'n-ig-s2',
      'n-ig-s10',
      'n-x',
      'n-fb-off',
      'n-dev',
      'n-dev-off',
    ],
  ],
  ['bayt al qahwa', ['bayt-fb', 'bayt-tt']],
  ['Client 2', ['c2-ig', 'c2-li']],
  ['Client 10', ['c10-ig']],
  ['Noor Dental', ['noor-fb']],
  ['روضة للزهور', ['rawda-ig']],
];

const nameOfId = (id: string) => ORDER.find((c) => c.id === id)!.name;

// A no-customer channel and two customers, Client 2 sorting before Client 10.
const GROUPS: Channel[] = [
  channel('ten', { name: 'Ten Shop', customer: CLIENT_10 }),
  channel('lamsa', { name: 'Lamsa Studio' }),
  channel('two-shop', {
    name: 'Two Shop',
    identifier: 'linkedin',
    customer: CLIENT_2,
  }),
  channel('two-cafe', { name: 'Two Cafe', customer: CLIENT_2 }),
];

// Seven channels, one past the search threshold. None of Noor Dental's
// channels has "noor" in its name.
const SEARCH: Channel[] = [
  channel('s-ig', { name: 'Lamsa Studio' }),
  channel('s-li', { name: 'Mona Saeed', identifier: 'linkedin' }),
  channel('s-lip', { name: 'Lamsa Pages', identifier: 'linkedin-page' }),
  channel('s-x', { name: 'Zed', identifier: 'x' }),
  channel('s-fb', {
    name: 'Smile Clinic',
    identifier: 'facebook',
    customer: NOOR,
  }),
  channel('s-ar', { name: 'ابتسامة', customer: NOOR }),
  channel('s-pin', {
    name: 'Rawda Florist',
    identifier: 'pinterest',
    customer: RAWDA,
  }),
];

const CUSTOM_FIELDS = [{ key: 'service', label: 'Service', type: 'text' }];

// Each state once, and two channels with more than one: the second line shows
// the first that applies (disabled, disconnected, needs setup).
const ROWS: Channel[] = [
  channel('ig', { name: 'Lamsa Studio', identifier: 'instagram-standalone' }),
  channel('yt', { name: 'بيت القهوة', identifier: 'youtube', picture: null }),
  channel('off', {
    name: 'Rawda Florist',
    identifier: 'pinterest',
    disabled: true,
    refreshNeeded: true,
  }),
  channel('dc', {
    name: 'Noor Dental',
    identifier: 'facebook',
    refreshNeeded: true,
    inBetweenSteps: true,
  }),
  channel('setup', {
    name: 'Mona Saeed',
    identifier: 'linkedin',
    inBetweenSteps: true,
  }),
  channel('sky', {
    name: 'Sky Studio',
    identifier: 'bluesky',
    refreshNeeded: true,
    isCustomFields: true,
    customFields: CUSTOM_FIELDS,
  }),
];

const update = jest.fn();
const onChange = jest.fn();
const onToggleCollapse = jest.fn();
const onDone = jest.fn();

const mounted: Root[] = [];
let host: HTMLElement;

const mount = async (node: ReactElement) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(node);
  });
  return host;
};

const render = (channels: Channel[], values: Record<string, unknown> = {}) =>
  mount(
    <ChannelPanel
      mode="calendar"
      channels={channels}
      selected={null}
      onChange={onChange}
      update={update}
      onToggleCollapse={onToggleCollapse}
      onDone={onDone}
      {...values}
    />
  );

// Not [class*="…"] selectors: happy-dom's parser trips on the brackets in
// Tailwind's arbitrary values.
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
const has = (node: Element | null | undefined, name: string) =>
  classes(node).includes(name);
const within = (root: Element) => Array.from(root.querySelectorAll('*'));
// The elements holding exactly this text and no element of their own.
const leaf = (root: Element, text: string) =>
  within(root).filter(
    (el) => el.children.length === 0 && (el.textContent ?? '').trim() === text
  );
const closestWith = (node: Element, name: string) => {
  for (let el: Element | null = node; el && el !== host; el = el.parentElement)
    if (has(el, name)) return el;
  return null;
};
const labelOf = (el: Element) => {
  const ids = el.getAttribute('aria-labelledby');
  if (ids)
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim();
  return el.getAttribute('aria-label') ?? '';
};
const nameOf = (el: Element) => labelOf(el) || (el.textContent ?? '').trim();
const controls = (root: Element) =>
  Array.from(root.querySelectorAll('button, [role="button"], input'));
const control = (root: Element, name: string) =>
  controls(root).filter((el) => nameOf(el) === name);
// Shown unless it or something around it is `hidden`, the way a closed group,
// a search or a mobile:-only control leaves it.
const isShown = (node: Element) => {
  for (let el: Element | null = node; el && el !== host; el = el.parentElement)
    if (has(el, 'hidden') || el.hasAttribute('hidden')) return false;
  return true;
};
// A row's main button is the button holding its picture.
const rowButtons = (root: Element) =>
  Array.from(root.querySelectorAll('button')).filter((button) =>
    button.querySelector('img')
  );
const rowName = (button: Element) =>
  button.querySelector('bdi')?.textContent ?? '';
const shownNames = () => rowButtons(host).filter(isShown).map(rowName);
const mainButton = (name: string) =>
  rowButtons(host).find((button) => rowName(button) === name)!;
// The row is what holds the main button and the buttons beside it.
const rowOf = (name: string) => mainButton(name).parentElement!;
const secondLine = (name: string) =>
  within(mainButton(name)).filter((el) => has(el, 'text-[12px]'));
const besideButtons = (name: string, text: string) =>
  Array.from(rowOf(name).querySelectorAll('button')).filter(
    (button) => (button.textContent ?? '').trim() === text
  );
const customerGroups = (root: Element) =>
  Array.from(root.querySelectorAll('[role="group"]')).filter(labelOf);
const groupOf = (name: string) =>
  customerGroups(host).find((group) => labelOf(group) === name)!;
// The + has aria-expanded too, as a menu button, so it isn't a chevron.
const chevrons = (root: Element) =>
  Array.from(root.querySelectorAll('[aria-expanded]')).filter(
    (el) => !el.hasAttribute('aria-haspopup')
  );
const stickyBlocks = () =>
  within(host).filter((el) => has(el, 'sticky') && has(el, 'top-0'));
const zIndex = (el: Element) => {
  const values = classes(el)
    .map((name) => /^z-(\d+)$/.exec(name) ?? /^z-\[(\d+)\]$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match![1]));
  return values.length ? Math.max(...values) : undefined;
};
const menuItems = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]'));

const click = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
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

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  localStorage.clear();
  mockOpened.length = 0;
  mockUser = {};
  jest.clearAllMocks();
  await i18next.changeLanguage('en');
});

describe('the order (R2, C14)', () => {
  const shape = (list: Channel[]) =>
    orderChannels(list).map((group) => [
      group.customer?.name ?? null,
      group.channels.map((c: Channel) => c.id),
    ]);

  it('puts the channels with no customer first, then customers A to Z, each ordered by type, enabled, platform, name and id', () => {
    expect(shape(ORDER)).toEqual(ORDERED);
    expect(orderChannels(ORDER)[0].customer).toBeNull();
  });

  it('gives the same order whatever order the list comes in', () => {
    expect(shape([...ORDER].reverse())).toEqual(ORDERED);
    expect(shape([...ORDER.slice(7), ...ORDER.slice(0, 7)])).toEqual(ORDERED);
  });

  it('gives the same order with i18next on en and on ar', async () => {
    const english = shape(ORDER);
    await i18next.changeLanguage('ar');

    expect(shape(ORDER)).toEqual(english);
  });

  it('has no group without a channel', () => {
    const customersOnly = ORDER.filter((c) => c.customer);

    expect(shape(customersOnly)).toEqual(ORDERED.slice(1));
  });

  it('never ties two channels, so two loads never swap them', () => {
    ORDER.forEach((a) =>
      ORDER.forEach((b) => {
        const ab = Math.sign(compareChannels(a, b));
        expect(ab).toBe(a === b ? 0 : -Math.sign(compareChannels(b, a)));
        if (a !== b) expect(ab).not.toBe(0);
      })
    );
  });

  // The flat list the calendar hands the composer is [...list].sort(compareChannels):
  // today's order with the name and id tie-breaks added (C14).
  it("agrees with today's orderBy wherever that has no tie", () => {
    const today = (list: Channel[]) =>
      orderBy(list, ['type', 'disabled', 'identifier'], ['desc', 'asc', 'asc']);
    const key = (c: Channel) => `${c.type}|${c.disabled}|${c.identifier}`;

    expect([...ORDER].sort(compareChannels).map(key)).toEqual(
      today(ORDER).map(key)
    );
    const untied = uniqBy(ORDER, key);
    expect([...untied].sort(compareChannels).map((c) => c.id)).toEqual(
      today(untied).map((c) => c.id)
    );
  });

  it.each(['en', 'ar'])(
    'renders the groups and rows in that order with i18next on %s',
    async (lng) => {
      await i18next.changeLanguage(lng);
      await render(ORDER);

      expect(shownNames()).toEqual(
        ORDERED.flatMap(([, ids]) => ids.map(nameOfId))
      );
      expect(customerGroups(host).map(labelOf)).toEqual(
        ORDERED.slice(1).map(([name]) => name)
      );
      // the channels with no customer come before the first group, outside any
      const first = customerGroups(host)[0];
      rowButtons(host)
        .slice(0, ORDERED[0][1].length)
        .forEach((button) => {
          expect(
            customerGroups(host).some((group) => group.contains(button))
          ).toBe(false);
          expect(
            first.compareDocumentPosition(button) &
              Node.DOCUMENT_POSITION_PRECEDING
          ).toBeTruthy();
        });
    }
  );
});

describe('the header', () => {
  it('reads Channels with the number of channels', async () => {
    await render(GROUPS);

    expect(host.querySelector('h2')?.textContent).toBe('channels');
    expect(leaf(host, String(GROUPS.length))).toHaveLength(1);
  });

  it('has a + labelled add_a_channel that offers Add Channel and Invite a customer, each with its hint', async () => {
    await render(GROUPS);
    const plus = control(host, 'add_a_channel');
    expect(plus).toHaveLength(1);
    expect(plus[0].getAttribute('aria-haspopup')).toBe('menu');
    expect(plus[0].getAttribute('aria-expanded')).toBe('false');

    await click(plus[0]);

    expect(plus[0].getAttribute('aria-expanded')).toBe('true');
    const [add, invite, ...rest] = menuItems();
    expect(rest).toHaveLength(0);
    expect(leaf(add, 'add_channel')).toHaveLength(1);
    expect(leaf(add, 'add_channel_hint')).toHaveLength(1);
    expect(leaf(invite, 'invite_a_customer')).toHaveLength(1);
    expect(leaf(invite, 'invite_a_customer_hint')).toHaveLength(1);
  });

  it('runs useAddProvider(update) for Add Channel and useAddProvider(update, true) for Invite a customer', async () => {
    await render(GROUPS);

    expect(mockUseAddProvider).toHaveBeenCalledWith(update);
    expect(mockUseAddProvider).toHaveBeenCalledWith(update, true);

    await click(control(host, 'add_a_channel')[0]);
    await click(menuItems()[0]);
    expect(mockOpened).toEqual([[update]]);

    await click(control(host, 'add_a_channel')[0]);
    await click(menuItems()[1]);
    expect(mockOpened).toEqual([[update], [update, true]]);
  });

  it('has Collapse on the rail, calling onToggleCollapse, and Done on the sheet, calling onDone', async () => {
    await render(GROUPS);
    const collapse = control(host, 'collapse');
    const done = control(host, 'done');
    expect(collapse).toHaveLength(1);
    expect(control(host, 'expand')).toHaveLength(0);
    expect(done).toHaveLength(1);
    // as SplitPanel's own controls were: the rail's hidden at 1025px and
    // below, the sheet's shown only there
    expect(classes(collapse[0])).toContain('mobile:hidden');
    expect(classes(done[0])).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );

    await click(collapse[0]);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    await click(done[0]);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it('has Expand instead of Collapse when collapsed, calling onToggleCollapse', async () => {
    await render(GROUPS, { collapsed: true });
    const expand = control(host, 'expand');
    expect(expand).toHaveLength(1);
    expect(control(host, 'collapse')).toHaveLength(0);
    expect(classes(expand[0])).toContain('mobile:hidden');

    await click(expand[0]);

    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('the hint', () => {
  it('says what a tick means on the calendar, in one 12px muted line', async () => {
    await render(GROUPS);
    const hint = leaf(host, 'channel_hint_calendar');

    expect(hint).toHaveLength(1);
    expect(closestWith(hint[0], 'text-[12px]')).not.toBeNull();
    expect(closestWith(hint[0], 'text-muted')).not.toBeNull();
  });
});

describe('the search', () => {
  const search = () => host.querySelector('input') as HTMLInputElement;

  it('is absent with 6 channels and present with 7', async () => {
    await render(SEARCH.slice(0, 6));
    expect(host.querySelector('input')).toBeNull();
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });

    await render(SEARCH);
    expect(search()).not.toBeNull();
    expect(search().getAttribute('placeholder')).toBe('search_channels');
    expect(
      labelOf(search()) || search().closest('label')?.textContent?.trim()
    ).toBe('search_channels');
    // a name typed in either script keeps its own direction
    expect(search().getAttribute('dir')).toBe('auto');
  });

  it.each([
    [
      'a channel name, ignoring case',
      'en',
      'LAMSA',
      ['Lamsa Studio', 'Lamsa Pages'],
    ],
    [
      'a platform name in English',
      'en',
      'linkedin',
      ['Mona Saeed', 'Lamsa Pages'],
    ],
    [
      'a platform name in Arabic',
      'ar',
      'إنستغرام',
      ['Lamsa Studio', 'ابتسامة'],
    ],
  ])('matches %s', async (_, lng, text, names) => {
    await i18next.changeLanguage(lng);
    await render(SEARCH);

    await type(search(), text);

    expect(shownNames()).toEqual(names);
    expect(leaf(host, 'no_channel_matches')).toHaveLength(0);
  });

  it('shows every channel of a customer whose name matches', async () => {
    await render(SEARCH);

    await type(search(), 'noor');

    expect(shownNames()).toEqual(['Smile Clinic', 'ابتسامة']);
    expect(customerGroups(host).filter(isShown).map(labelOf)).toEqual([
      'Noor Dental',
    ]);
  });

  it('says No channel matches when nothing does', async () => {
    await render(SEARCH);
    expect(leaf(host, 'no_channel_matches')).toHaveLength(0);

    await type(search(), 'zzqx');

    expect(shownNames()).toEqual([]);
    const line = leaf(host, 'no_channel_matches');
    expect(line).toHaveLength(1);
    expect(isShown(line[0])).toBe(true);
  });
});

describe('the groups', () => {
  it('gives a customer a header with a chevron, its colour, its name and its count, inside a group named for it', async () => {
    await render(GROUPS);

    expect(customerGroups(host).map(labelOf)).toEqual([
      'Client 2',
      'Client 10',
    ]);
    const group = groupOf('Client 2');
    const [chevron, ...others] = chevrons(group);
    expect(others).toHaveLength(0);
    expect(chevron.getAttribute('aria-expanded')).toBe('true');
    expect(within(group).some((el) => has(el, customerHue('Client 2')))).toBe(
      true
    );
    // the customer's name keeps its own direction, as a channel's does
    expect(
      Array.from(group.querySelectorAll('bdi')).map((bdi) => bdi.textContent)
    ).toContain('Client 2');
    expect(leaf(group, '2')).toHaveLength(1);
  });

  it('closes and opens a group from its chevron, writing <name>_isOpen', async () => {
    await render(GROUPS);
    expect(shownNames()).toEqual([
      'Lamsa Studio',
      'Two Cafe',
      'Two Shop',
      'Ten Shop',
    ]);

    await click(chevrons(groupOf('Client 2'))[0]);

    expect(chevrons(groupOf('Client 2'))[0].getAttribute('aria-expanded')).toBe(
      'false'
    );
    expect(localStorage.getItem('Client 2_isOpen')).toBe('0');
    expect(shownNames()).toEqual(['Lamsa Studio', 'Ten Shop']);

    await click(chevrons(groupOf('Client 2'))[0]);

    expect(chevrons(groupOf('Client 2'))[0].getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(localStorage.getItem('Client 2_isOpen')).toBe('1');
    expect(shownNames()).toEqual([
      'Lamsa Studio',
      'Two Cafe',
      'Two Shop',
      'Ten Shop',
    ]);
  });

  it('reads <name>_isOpen when it mounts, open when nothing is stored', async () => {
    localStorage.setItem('Client 10_isOpen', '0');
    await render(GROUPS);

    expect(
      chevrons(groupOf('Client 10'))[0].getAttribute('aria-expanded')
    ).toBe('false');
    expect(chevrons(groupOf('Client 2'))[0].getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(shownNames()).toEqual(['Lamsa Studio', 'Two Cafe', 'Two Shop']);
  });

  it('is a flat list with no headers when there are no customers', async () => {
    const flat = GROUPS.map((c) => ({ ...c, customer: null }));
    await render(flat);

    expect(customerGroups(host)).toHaveLength(0);
    expect(chevrons(host)).toHaveLength(0);
    expect(shownNames()).toEqual([
      'Lamsa Studio',
      'Ten Shop',
      'Two Cafe',
      'Two Shop',
    ]);
  });

  it("shows today's empty state and + with no channels", async () => {
    await render([]);

    expect(host.querySelector('[data-testid="no-channels"]')).not.toBeNull();
    expect(leaf(host, 'no_channels')).toHaveLength(1);
    expect(leaf(host, 'connect_your_accounts')).toHaveLength(1);
    expect(control(host, 'add_a_channel')).toHaveLength(1);
    expect(rowButtons(host)).toHaveLength(0);
    expect(host.querySelector('input')).toBeNull();
  });

  it('has no search with one channel', async () => {
    await render(GROUPS.slice(0, 1));

    expect(rowButtons(host)).toHaveLength(1);
    expect(host.querySelector('input')).toBeNull();
  });
});

describe('the rows', () => {
  it('draws a 36px picture with a 16px platform badge', async () => {
    await render(ROWS);
    const images = (name: string) =>
      Array.from(mainButton(name).querySelectorAll('img'));
    const src = (name: string, value: string) =>
      images(name).find((img) => img.getAttribute('src') === value);

    const picture = src('Lamsa Studio', '/avatar-ig.png');
    expect(picture?.getAttribute('width')).toBe('36');
    expect(picture?.getAttribute('height')).toBe('36');
    const badge = src(
      'Lamsa Studio',
      '/icons/platforms/instagram-standalone.png'
    );
    expect(badge?.getAttribute('width')).toBe('16');
    expect(badge?.getAttribute('height')).toBe('16');

    // no picture falls back as today, and YouTube's badge is its svg (C13)
    const fallback = src('بيت القهوة', '/no-picture.jpg');
    expect(fallback?.getAttribute('width')).toBe('36');
    expect(fallback?.getAttribute('height')).toBe('36');
    expect(
      src('بيت القهوة', '/icons/platforms/youtube.svg')?.getAttribute('width')
    ).toBe('16');
  });

  // The ellipsis is drawn at the end of the box that cuts the text, in that
  // box's direction, so the <bdi> itself cuts it: an Arabic name on an English
  // page loses its own end, not its start.
  it('sets the name in 14px inside a <bdi> that cuts it at its own end', async () => {
    await render(ROWS);

    ROWS.forEach(({ name }) => {
      const bdi = mainButton(name).querySelector('bdi');
      expect(bdi?.textContent).toBe(name);
      expect(classes(bdi)).toEqual(
        expect.arrayContaining(['text-[14px]', 'truncate'])
      );
    });
  });

  it.each([
    ['en', 'Lamsa Studio', 'Instagram'],
    ['en', 'بيت القهوة', 'YouTube'],
    ['ar', 'Lamsa Studio', 'إنستغرام'],
    ['ar', 'بيت القهوة', 'يوتيوب'],
    // under the plan's limit, so disabled by hand
    ['en', 'Rawda Florist', 'channel_disabled'],
    ['en', 'Noor Dental', 'channel_disconnected'],
    ['en', 'Mona Saeed', 'channel_needs_setup'],
    ['en', 'Sky Studio', 'channel_disconnected'],
  ])(
    'gives the second line in 12px, with i18next on %s: %s reads %s',
    async (lng, name, text) => {
      await i18next.changeLanguage(lng);
      await render(ROWS);
      const lines = secondLine(name);

      expect(lines).toHaveLength(1);
      expect((lines[0].textContent ?? '').trim()).toBe(text);
    }
  );

  it('is 52px tall, 56px on the sheet', async () => {
    await render(ROWS);

    ROWS.forEach(({ name }) => {
      expect(classes(rowOf(name))).toEqual(
        expect.arrayContaining(['min-h-[52px]', 'mobile:min-h-[56px]'])
      );
    });
  });

  it('offers Reconnect when disconnected and Finish setup when it needs setup, as buttons beside the main one', async () => {
    await render(ROWS);
    const offers: Array<[string, string[]]> = [
      ['Lamsa Studio', []],
      ['Rawda Florist', []],
      ['Noor Dental', ['reconnect']],
      ['Mona Saeed', ['finish_setup']],
      ['Sky Studio', ['reconnect']],
    ];

    offers.forEach(([name, actions]) => {
      const main = mainButton(name);
      expect(main.getAttribute('type')).toBe('button');
      expect(main.querySelector('button, [role="button"]')).toBeNull();
      ['reconnect', 'finish_setup'].forEach((text) => {
        const found = besideButtons(name, text);
        expect(found).toHaveLength(actions.includes(text) ? 1 : 0);
        found.forEach((button) => {
          expect(button.getAttribute('type')).toBe('button');
          expect(main.contains(button)).toBe(false);
        });
      });
    });
  });
});

describe('Reconnect and Finish setup (R4)', () => {
  const realLocation = window.location;

  beforeEach(() => {
    mockFetch.mockResolvedValue({
      json: async () => ({ url: 'https://auth.example/connect' }),
    });
    // Navigation is observed, not performed.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: realLocation,
    });
  });

  it('fetches the refresh URL and goes to it', async () => {
    await render(ROWS);

    await click(besideButtons('Noor Dental', 'reconnect')[0]);
    await flush();

    expect(mockFetch).toHaveBeenCalledWith(
      '/integrations/social/facebook?refresh=internal-dc',
      { method: 'GET' }
    );
    expect(window.location.href).toBe('https://auth.example/connect');
    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the custom-variables modal for a custom-fields channel', async () => {
    await render(ROWS);

    await click(besideButtons('Sky Studio', 'reconnect')[0]);
    await flush();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const { title, withCloseButton, children } = mockOpenModal.mock.calls[0][0];
    expect(title).toBe('custom_url');
    expect(withCloseButton).toBe(false);
    expect(children.type).toBe(CustomVariables);
    expect(children.props).toMatchObject({
      identifier: 'bluesky',
      variables: CUSTOM_FIELDS,
    });
    children.props.gotoUrl('/launches?added=bluesky');
    expect(mockPush).toHaveBeenCalledWith('/launches?added=bluesky');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pushes the continue route for Finish setup', async () => {
    await render(ROWS);

    await click(besideButtons('Mona Saeed', 'finish_setup')[0]);
    await flush();

    expect(mockPush).toHaveBeenCalledWith(
      '/launches?added=linkedin&continue=setup'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  // The calendar's ⋯ Menu takes it as its refreshChannel (T036), so the hook
  // returns what refreshChannel was: a channel in, a handler out.
  it('is the hook useReconnectChannel, a channel in and a handler out', async () => {
    let reconnect: ReturnType<typeof useReconnectChannel> | undefined;
    const Probe = () => {
      reconnect = useReconnectChannel();
      return null;
    };
    host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<Probe />);
    });

    await act(async () => {
      await reconnect!(ROWS[3])();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/integrations/social/facebook?refresh=internal-dc',
      { method: 'GET' }
    );
    expect(window.location.href).toBe('https://auth.example/connect');
  });
});

describe('the collapsed list', () => {
  it('shows pictures only, each with the channel name as its label and its tooltip', async () => {
    await render(GROUPS, { collapsed: true });

    expect(host.querySelectorAll('bdi')).toHaveLength(0);
    expect(host.querySelector('input')).toBeNull();
    expect(leaf(host, 'channel_hint_calendar')).toHaveLength(0);
    GROUPS.forEach(({ name, picture }) => {
      expect(host.textContent).not.toContain(name);
      const button = rowButtons(host).find(
        (el) => el.getAttribute('aria-label') === name
      );
      expect(button).toBeDefined();
      expect(button!.getAttribute('data-tooltip-id')).toBe('tooltip');
      expect(button!.getAttribute('data-tooltip-content')).toBe(name);
      expect(
        Array.from(button!.querySelectorAll('img')).some(
          (img) => img.getAttribute('src') === picture
        )
      ).toBe(true);
    });
  });
});

describe('focus and touch (FR-052)', () => {
  const FOCUS = [...SEARCH, ROWS[3], ROWS[4]];

  it.each([
    ['the open list', {}],
    ['the collapsed list', { collapsed: true }],
  ])(
    'gives every control of %s the brand focus ring and 44px on a coarse pointer',
    async (_, values) => {
      await render(FOCUS, values);
      const all = controls(host);
      expect(all.length).toBeGreaterThan(FOCUS.length);

      const missing = all
        .filter((el) => {
          const names = classes(el);
          const ring =
            names.includes('focus-visible:ring-2') &&
            names.includes('focus-visible:ring-brand');
          const tall = names.some((name) =>
            /^coarse:(min-)?h-\[44px\]$/.test(name)
          );
          // a control with no words, a picture or an icon, is 44px wide too
          const iconOnly =
            el.tagName !== 'INPUT' && !(el.textContent ?? '').trim();
          const wide =
            !iconOnly ||
            names.some((name) => /^coarse:(min-)?w-\[44px\]$/.test(name));
          return !(ring && tall && wide);
        })
        .map((el) => nameOf(el) || el.outerHTML.slice(0, 120));
      expect(missing).toEqual([]);
    }
  );
});

describe('the sticky block (C28)', () => {
  it('keeps the header, the hint and the search in one sticky top-0 block on the panel background, above the rows', async () => {
    await render(SEARCH);
    const blocks = stickyBlocks();
    expect(blocks).toHaveLength(1);
    const [block] = blocks;

    expect(classes(block)).toContain('bg-newBgColorInner');
    expect(block.querySelector('h2')?.textContent).toBe('channels');
    expect(control(block, 'add_a_channel')).toHaveLength(1);
    expect(control(block, 'collapse')).toHaveLength(1);
    expect(control(block, 'done')).toHaveLength(1);
    expect(leaf(block, 'channel_hint_calendar')).toHaveLength(1);
    expect(block.querySelector('input')).not.toBeNull();
    expect(rowButtons(block)).toHaveLength(0);
    expect(customerGroups(block)).toHaveLength(0);

    // The groups scroll under it with no row showing above it: its z-index is
    // above every z-index in what scrolls under it, the badge's included.
    const own = zIndex(block);
    expect(own).toBeDefined();
    const under = within(host)
      .filter((el) => !block.contains(el) && !el.contains(block))
      .map(zIndex)
      .filter((value): value is number => value !== undefined);
    expect(own!).toBeGreaterThan(Math.max(0, ...under));
  });

  // SplitPanel's scroller has no top padding, since a sticky block sticks
  // that far below a padded scroller's top and rows would show above it.
  it('carries the 20px above the header itself, on the rail and collapsed', async () => {
    for (const collapsed of [false, true]) {
      await render(SEARCH, { collapsed });
      const [block] = stickyBlocks();

      expect(classes(block)).toContain('pt-[20px]');
    }
  });
});

describe('isUsable on the calendar (C20)', () => {
  it.each([
    ['an enabled channel', true, {}],
    ['a disconnected channel', true, { refreshNeeded: true }],
    ['a channel that needs setup', true, { inBetweenSteps: true }],
    ['a disabled channel', false, { disabled: true }],
    [
      'a disabled, disconnected channel',
      false,
      { disabled: true, refreshNeeded: true },
    ],
  ])('says %s is usable: %s', (_, usable, values) => {
    expect(isUsable(channel('u', values), 'calendar')).toBe(usable);
  });
});

// The calendar's own parts (contracts/channel-panel.md, C5, C16, C25, C27). A
// tick shows a channel's posts, and the page keeps the ids that show, null for
// all. A disabled row can't be ticked and its posts always show, so every
// array the list builds holds every disabled channel's id.
//
// No customer: one usable channel and a disabled one. Client 2: two usable.
// Client 10: one usable and one disabled. Noor Dental: a disabled one only.
const CAL: Channel[] = [
  channel('lamsa', { name: 'Lamsa Studio' }),
  channel('archive', {
    name: 'Archive',
    identifier: 'facebook',
    disabled: true,
  }),
  channel('two-shop', {
    name: 'Two Shop',
    identifier: 'linkedin',
    customer: CLIENT_2,
  }),
  channel('two-cafe', { name: 'Two Cafe', customer: CLIENT_2 }),
  channel('ten', { name: 'Ten Shop', customer: CLIENT_10 }),
  channel('ten-off', {
    name: 'Ten Archive',
    identifier: 'x',
    customer: CLIENT_10,
    disabled: true,
  }),
  channel('noor-off', {
    name: 'Noor Clinic',
    identifier: 'facebook',
    customer: NOOR,
    disabled: true,
  }),
];
const ALL = CAL.map((c) => c.id);
const without = (...ids: string[]) => ALL.filter((id) => !ids.includes(id));
const sorted = (ids: string[]) => [...ids].sort();
// What the one onChange call passed, its ids in any order.
const changedTo = () => {
  expect(onChange).toHaveBeenCalledTimes(1);
  const [value] = onChange.mock.calls[0];
  return value === null ? null : sorted(value);
};

const rowMenu = jest.fn((c: Channel) => (
  <button type="button" aria-label={`menu ${c.id}`} data-row-menu={c.id} />
));
const onRenameCustomer = jest.fn();

// From a node up to and including `top`.
const chain = (node: Element, top: Element) => {
  const list: Element[] = [];
  for (let el: Element | null = node; el; el = el.parentElement) {
    list.push(el);
    if (el === top) break;
  }
  return list;
};
const pictureOf = (name: string) =>
  Array.from(mainButton(name).querySelectorAll('img')).find(
    (img) =>
      img.getAttribute('src') === CAL.find((c) => c.name === name)!.picture
  )!;
// The row's checkbox, the app's 20px Check, beside its main button.
const checkboxOf = (name: string) => {
  const found = within(rowOf(name)).filter(
    (el) =>
      has(el, 'w-[20px]') &&
      has(el, 'h-[20px]') &&
      !mainButton(name).contains(el)
  );
  expect(found).toHaveLength(1);
  return found[0];
};
// Ticked by a mark, never by colour alone.
const ticked = (name: string) => !!checkboxOf(name).querySelector('svg');
// A customer's own checkbox: the one in its group that isn't a row's.
const tickOf = (name: string) => {
  const found = Array.from(
    groupOf(name).querySelectorAll('[role="checkbox"]')
  ).filter((el) => !el.querySelector('img'));
  expect(found).toHaveLength(1);
  return found[0];
};
const isDisabled = (el: Element) =>
  el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
const hintLine = () =>
  within(host).find(
    (el) =>
      has(el, 'text-[12px]') &&
      (el.textContent ?? '').trim().startsWith('channel_hint_calendar')
  )!;
// The brand focus ring and 44px on a coarse pointer, as FR-052 asks of every
// control in the list.
const reachable = (el: Element) => {
  const names = classes(el);
  const iconOnly = !(el.textContent ?? '').trim();
  return (
    names.includes('focus-visible:ring-2') &&
    names.includes('focus-visible:ring-brand') &&
    names.some((name) => /^coarse:(min-)?h-\[44px\]$/.test(name)) &&
    (!iconOnly || names.some((name) => /^coarse:(min-)?w-\[44px\]$/.test(name)))
  );
};

describe('calendar ticks (C5)', () => {
  it('makes each row a checkbox, checked while its posts show', async () => {
    await render(CAL, { selected: without('lamsa') });

    CAL.forEach(({ id, name }) => {
      const main = mainButton(name);
      expect(main.getAttribute('role')).toBe('checkbox');
      expect(main.getAttribute('aria-checked')).toBe(
        id === 'lamsa' ? 'false' : 'true'
      );
    });
  });

  it("from null, unticking a row passes every other channel's id, the disabled channels' included", async () => {
    await render(CAL);

    await click(mainButton('Lamsa Studio'));

    expect(changedTo()).toEqual(sorted(without('lamsa')));
  });

  it('unticking another row keeps what is hidden hidden', async () => {
    await render(CAL, { selected: without('lamsa') });

    await click(mainButton('Two Cafe'));

    expect(changedTo()).toEqual(sorted(without('lamsa', 'two-cafe')));
  });

  it("puts back a disabled channel's id the array was missing", async () => {
    await render(CAL, { selected: without('lamsa', 'archive') });

    await click(mainButton('Two Cafe'));

    expect(changedTo()).toEqual(sorted(without('lamsa', 'two-cafe')));
  });

  it("does the same from the row's checkbox", async () => {
    await render(CAL);

    await click(checkboxOf('Two Cafe'));

    expect(changedTo()).toEqual(sorted(without('two-cafe')));
  });

  it.each([
    ['the only hidden channel', without('lamsa'), null],
    [
      'one of two hidden channels',
      without('lamsa', 'two-cafe'),
      without('two-cafe'),
    ],
    [
      'the last hidden channel of an array missing a disabled id',
      without('lamsa', 'archive'),
      null,
    ],
    [
      "the last hidden channel of an array holding a deleted channel's id",
      [...without('lamsa'), 'deleted'],
      null,
    ],
  ])(
    'ticking %s passes the ids that show, or null once every usable channel shows',
    async (_, selected, expected) => {
      await render(CAL, { selected });

      await click(mainButton('Lamsa Studio'));

      expect(changedTo()).toEqual(expected && sorted(expected));
    }
  );
});

describe('a customer tick (C5)', () => {
  // The page keeps the selection, so a tick shows once the page hands it back.
  const CalendarPage: FC<{ initial: string[] | null }> = ({ initial }) => {
    const [selected, setSelected] = useState(initial);
    return (
      <ChannelPanel
        mode="calendar"
        channels={CAL}
        selected={selected}
        onChange={(next: string[] | null) => {
          onChange(next);
          setSelected(next);
        }}
        update={update}
        onToggleCollapse={onToggleCollapse}
        onDone={onDone}
      />
    );
  };

  it.each([
    ['null', null, 'true', 'true'],
    ['some of each hidden', without('two-shop', 'ten'), 'mixed', 'false'],
    [
      "all of Client 2's hidden",
      without('two-shop', 'two-cafe'),
      'false',
      'true',
    ],
  ])(
    'is a checkbox named for the customer that counts only its usable channels: with %s',
    async (_, selected, client2, client10) => {
      await render(CAL, { selected });

      expect(nameOf(tickOf('Client 2'))).toBe('Client 2');
      expect(tickOf('Client 2').getAttribute('aria-checked')).toBe(client2);
      // Ten Archive is disabled, so only Ten Shop counts
      expect(tickOf('Client 10').getAttribute('aria-checked')).toBe(client10);
    }
  );

  it.each([
    ['Client 2', ['two-shop', 'two-cafe']],
    ['Client 10', ['ten']],
  ])(
    "hides all of %s's usable channels, %p, and ticking it again shows them",
    async (customer, hidden) => {
      await mount(<CalendarPage initial={null} />);

      await click(tickOf(customer));

      expect(changedTo()).toEqual(sorted(without(...hidden)));
      expect(tickOf(customer).getAttribute('aria-checked')).toBe('false');
      CAL.filter((c) => c.customer?.name === customer).forEach((c) =>
        expect(mainButton(c.name).getAttribute('aria-checked')).toBe(
          hidden.includes(c.id) ? 'false' : 'true'
        )
      );

      onChange.mockClear();
      await click(tickOf(customer));

      expect(changedTo()).toBeNull();
      expect(tickOf(customer).getAttribute('aria-checked')).toBe('true');
    }
  );

  it('shows all its usable channels from mixed, and what is hidden elsewhere stays hidden', async () => {
    await mount(<CalendarPage initial={without('two-shop', 'lamsa')} />);
    expect(tickOf('Client 2').getAttribute('aria-checked')).toBe('mixed');

    await click(tickOf('Client 2'));

    expect(changedTo()).toEqual(sorted(without('lamsa')));
    expect(tickOf('Client 2').getAttribute('aria-checked')).toBe('true');
  });

  it('is disabled when the customer has no usable channel, and changes nothing', async () => {
    await render(CAL);
    const tick = tickOf('Noor Dental');
    expect(isDisabled(tick)).toBe(true);

    await click(tick);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Show all', () => {
  it('ends the hint only while a usable channel is hidden', async () => {
    // nothing hidden: null, every id, or only a disabled id missing
    for (const selected of [null, ALL, without('archive')]) {
      await render(CAL, { selected });
      expect(control(host, 'show_all')).toHaveLength(0);
      act(() => {
        mounted.splice(0).forEach((root) => root.unmount());
      });
    }

    await render(CAL, { selected: without('two-cafe') });

    const buttons = control(host, 'show_all');
    expect(buttons).toHaveLength(1);
    const line = hintLine();
    expect(line.contains(buttons[0])).toBe(true);
    expect((line.textContent ?? '').trim().endsWith('show_all')).toBe(true);
    expect(buttons[0].getAttribute('type')).toBe('button');
    expect(reachable(buttons[0])).toBe(true);
  });

  it('passes null', async () => {
    await render(CAL, { selected: without('two-cafe', 'ten') });
    const [showAll, ...others] = control(host, 'show_all');
    expect(others).toHaveLength(0);
    expect(showAll).toBeDefined();

    await click(showAll);

    expect(changedTo()).toBeNull();
  });
});

describe('hidden and disabled rows (C25)', () => {
  it("greys a hidden row's picture and sets its name in text-muted, fades none of its text, and keeps its checkbox", async () => {
    await render(CAL, { selected: without('lamsa') });
    const name = 'Lamsa Studio';
    const bdi = mainButton(name).querySelector('bdi')!;

    const greyed = chain(pictureOf(name), rowOf(name)).filter((el) =>
      has(el, 'grayscale')
    );
    expect(greyed.length).toBeGreaterThan(0);
    greyed.forEach((el) => expect(el.contains(bdi)).toBe(false));
    expect(classes(bdi)).toContain('text-muted');
    expect(classes(bdi)).not.toContain('text-ink');
    expect(classes(secondLine(name)[0])).toContain('text-muted');
    // opacity on text fails AA; the picture alone may fade
    const faded = [...chain(rowOf(name), host), ...within(rowOf(name))]
      .filter((el) => (el.textContent ?? '').trim())
      .filter((el) =>
        classes(el).some(
          (cls) => /^opacity-\d+$/.test(cls) && cls !== 'opacity-100'
        )
      );
    expect(faded.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
    // still a checkbox that ticks it back
    expect(mainButton(name).getAttribute('aria-checked')).toBe('false');
    expect(isDisabled(mainButton(name))).toBe(false);
    expect(ticked(name)).toBe(false);

    // a shown row is in full colour and ticked
    expect(
      [rowOf('Two Cafe'), ...within(rowOf('Two Cafe'))].some((el) =>
        has(el, 'grayscale')
      )
    ).toBe(false);
    expect(classes(mainButton('Two Cafe').querySelector('bdi'))).toContain(
      'text-ink'
    );
    expect(ticked('Two Cafe')).toBe(true);
  });

  it("keeps a disabled row as today: it can't change, its picture and name at opacity-50", async () => {
    await render(CAL);
    const name = 'Archive';
    const main = mainButton(name);

    // its posts always show (C5)
    expect(main.getAttribute('role')).toBe('checkbox');
    expect(main.getAttribute('aria-checked')).toBe('true');
    // aria-disabled, as the canvas has it, not disabled: a disabled button
    // leaves the Tab order, so the reason couldn't be reached by keyboard
    expect(main.getAttribute('aria-disabled')).toBe('true');
    expect(main.hasAttribute('disabled')).toBe(false);
    expect(
      chain(pictureOf(name), rowOf(name)).some((el) => has(el, 'opacity-50'))
    ).toBe(true);
    expect(
      chain(main.querySelector('bdi')!, rowOf(name)).some((el) =>
        has(el, 'opacity-50')
      )
    ).toBe(true);

    await click(main);
    await click(checkboxOf(name));

    expect(onChange).not.toHaveBeenCalled();
  });

  // The second line says why. Over the plan only when the enabled channels
  // fill it, MenuComponent's tooltip condition, with that tooltip; under it,
  // the channel was disabled by hand from its ⋯ menu, and there's no tooltip.
  it.each([
    [
      "at the plan's limit, over your plan, with today's upgrade tooltip",
      CAL.filter((c) => !c.disabled).length,
      'channel_disabled_over_plan',
      1,
    ],
    ['under it, Channel Disabled, with no tooltip', 10, 'channel_disabled', 0],
  ])(
    'says why a disabled row is disabled: %s',
    async (_, totalChannels, reason, tooltips) => {
      const tips = () =>
        within(host).filter(
          (el) =>
            el.getAttribute('data-tooltip-content') ===
            'channel_disabled_upgrade_plan'
        );
      const disabledNames = CAL.filter((c) => c.disabled).map((c) => c.name);

      mockUser = { totalChannels };
      await render(CAL);

      expect(tips()).toHaveLength(disabledNames.length * tooltips);
      disabledNames.forEach((name) => {
        expect((secondLine(name)[0].textContent ?? '').trim()).toBe(reason);
        const own = tips().filter((el) => rowOf(name).contains(el));
        expect(own).toHaveLength(tooltips);
        own.forEach((el) =>
          expect(el.getAttribute('data-tooltip-id')).toBe('tooltip')
        );
      });
    }
  );
});

describe('the row menu and the customer pencil', () => {
  it("renders rowMenu for each row after its main button and before its checkbox, and its clicks don't tick", async () => {
    await render(CAL, { rowMenu });

    CAL.forEach(({ id, name }) => {
      const menus = Array.from(
        document.querySelectorAll(`[data-row-menu="${id}"]`)
      );
      expect(menus).toHaveLength(1);
      const [menu] = menus;
      expect(rowOf(name).contains(menu)).toBe(true);
      expect(mainButton(name).contains(menu)).toBe(false);
      expect(
        mainButton(name).compareDocumentPosition(menu) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        menu.compareDocumentPosition(checkboxOf(name)) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    await click(document.querySelector('[data-row-menu="lamsa"]')!);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts the pencil on each customer header only with onRenameCustomer, and calls it with the customer', async () => {
    await render(CAL);
    expect(control(host, 'edit_group_name')).toHaveLength(0);
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });

    await render(CAL, { onRenameCustomer });

    const customers = ['Client 2', 'Client 10', 'Noor Dental'];
    expect(control(host, 'edit_group_name')).toHaveLength(customers.length);
    customers.forEach((name) => {
      const [pencil, ...others] = control(groupOf(name), 'edit_group_name');
      expect(others).toHaveLength(0);
      // beside the chevron's button, never inside it
      expect(chevrons(groupOf(name))[0].contains(pencil)).toBe(false);
      expect(reachable(pencil)).toBe(true);
    });

    await click(control(groupOf('Client 2'), 'edit_group_name')[0]);

    expect(onRenameCustomer).toHaveBeenCalledTimes(1);
    expect(onRenameCustomer).toHaveBeenCalledWith(
      expect.objectContaining(CLIENT_2)
    );
    expect(chevrons(groupOf('Client 2'))[0].getAttribute('aria-expanded')).toBe(
      'true'
    );
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      mounted.splice(0).forEach((root) => root.unmount());
    });

    // the collapsed list has no pencil, as today
    await render(CAL, { onRenameCustomer, collapsed: true });

    expect(control(host, 'edit_group_name')).toHaveLength(0);
  });
});

describe('dragging a channel to a customer (C16, C27)', () => {
  const onMoveToCustomer = jest.fn();
  // the drag monitor at every render, read through the latest
  const monitors: Array<
    ReturnType<ReturnType<typeof useDragDropManager>['getMonitor']>
  > = [];
  const monitor = () => monitors[monitors.length - 1];
  const Monitor = () => {
    monitors.push(useDragDropManager().getMonitor());
    return null;
  };

  beforeAll(() => {
    // what a drag under way reaches for, as in calendar.month.hold.spec.tsx:
    // happy-dom has no elementsFromPoint, and Jest's node environment no
    // MutationObserver, nor the Image the html5 backend's empty preview is
    document.elementsFromPoint = () => [];
    Object.assign(globalThis, {
      MutationObserver: window.MutationObserver,
      Image: window.Image,
    });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    monitors.length = 0;
  });

  const renderDraggable = () =>
    mount(
      <DNDProvider>
        <Monitor />
        <ChannelPanel
          mode="calendar"
          channels={CAL}
          selected={null}
          onChange={onChange}
          update={update}
          onToggleCollapse={onToggleCollapse}
          onDone={onDone}
          onMoveToCustomer={onMoveToCustomer}
        />
      </DNDProvider>
    );

  // A finger, through the calendar's own pipeline. Under Jest the html5 step
  // listens on Node's global rather than the window, so a mouse drag can't be
  // played here; the touch step, which the first touch switches to, can.
  const touch = (
    type: 'touchstart' | 'touchmove' | 'touchend',
    target: Element,
    clientY: number
  ) => {
    const point = new window.Touch({
      identifier: 1,
      target,
      clientX: 20,
      clientY,
    });
    const down = type === 'touchend' ? [] : [point];
    act(() => {
      target.dispatchEvent(
        new window.TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: down,
          targetTouches: down,
          changedTouches: [point],
        })
      );
    });
  };
  const nameIn = (name: string) => mainButton(name).querySelector('bdi')!;
  // held on its name past the 400ms pickup (dnd.provider.tsx), then moved
  const pickUp = (name: string) => {
    touch('touchstart', nameIn(name), 100);
    act(() => {
      jest.advanceTimersByTime(400);
    });
    touch('touchmove', nameIn(name), 140);
  };
  // moved over the target and lifted there
  const dropOn = (target: Element) => {
    const under = jest
      .spyOn(document, 'elementsFromPoint')
      .mockReturnValue([target]);
    const top = jest
      .spyOn(document, 'elementFromPoint')
      .mockReturnValue(target);
    touch('touchmove', target, 200);
    touch('touchend', target, 200);
    under.mockRestore();
    top.mockRestore();
  };

  it('makes every row a drag source of type menu', async () => {
    await renderDraggable();

    // the html5 step marks each source, so a mouse picks a row up by its name
    CAL.forEach(({ name }) => {
      expect(
        chain(nameIn(name), host).some(
          (el) => el.getAttribute('draggable') === 'true'
        )
      ).toBe(true);
    });

    pickUp('Lamsa Studio');

    expect(monitor().isDragging()).toBe(true);
    expect(monitor().getItemType()).toBe('menu');
  });

  it.each([
    [
      "a customer's header",
      'Lamsa Studio',
      'lamsa',
      () => chevrons(groupOf('Client 2'))[0],
      CLIENT_2.id,
    ],
    [
      "another customer's header",
      'Two Shop',
      'two-shop',
      () => chevrons(groupOf('Client 10'))[0],
      CLIENT_10.id,
    ],
    [
      "a row in a customer's group",
      'Ten Shop',
      'ten',
      () => nameIn('Two Cafe'),
      CLIENT_2.id,
    ],
    [
      'the channels with no customer',
      'Two Cafe',
      'two-cafe',
      () => nameIn('Lamsa Studio'),
      '',
    ],
  ])(
    'dropped on %s, calls onMoveToCustomer with the channel and the customer',
    async (_, name, id, target, customer) => {
      await renderDraggable();

      pickUp(name);
      dropOn(target());

      expect(onMoveToCustomer).toHaveBeenCalledTimes(1);
      expect(onMoveToCustomer).toHaveBeenCalledWith(id, customer);
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  // Samy and Analytics have no DNDProvider (C16).
  it('without onMoveToCustomer, renders outside any DNDProvider with nothing to drag', async () => {
    await render(CAL, { rowMenu, onRenameCustomer });

    expect(rowButtons(host)).toHaveLength(CAL.length);
    expect(host.querySelector('[draggable="true"]')).toBeNull();
  });
});

// plan.md's testing table: "hiding a customer hides the wrong posts".
describe('on a real calendar', () => {
  const post = (id: string, channelId: string) => ({
    id,
    group: id,
    content: `<p>${id}</p>`,
    publishDate: '2026-11-11T10:00:00.000Z',
    state: 'QUEUE',
    intervalInDays: null,
    releaseURL: null,
    releaseId: null,
    tags: [],
    integration: {
      id: channelId,
      providerIdentifier: 'instagram',
      name: channelId,
      picture: '',
    },
  });
  // a post on each channel, and a second on Two Shop
  const POSTS = [
    ...CAL.map((c) => post(`post-${c.id}`, c.id)),
    post('post-two-shop-2', 'two-shop'),
  ];
  const allPostsBut = (...channelIds: string[]) =>
    sorted(
      POSTS.filter((p) => !channelIds.includes(p.integration.id)).map(
        (p) => p.id
      )
    );

  // what the calendar held at every render: the posts it shows and the
  // selection, read through the latest
  const frames: Array<{ shown: string[]; selection: string[] | null }> = [];
  const latest = () => frames[frames.length - 1];
  // the list on the calendar's own selection, as the page wires it (T036)
  const CalendarChannels = () => {
    const { integrations, selectedChannels, setSelectedChannels, posts } =
      useCalendar();
    frames.push({
      shown: sorted(posts.map((p) => p.id)),
      selection: selectedChannels,
    });
    return (
      <ChannelPanel
        mode="calendar"
        channels={integrations}
        selected={selectedChannels}
        onChange={setSelectedChannels}
        update={update}
        onToggleCollapse={onToggleCollapse}
        onDone={onDone}
      />
    );
  };

  beforeEach(() => {
    mockGridPosts = POSTS;
  });

  afterEach(() => {
    mockGridPosts = undefined;
    frames.length = 0;
  });

  it("ticking a customer off leaves exactly that customer's posts out of filterByChannels, and a disabled channel's posts in", async () => {
    await mount(
      <CalendarWeekProvider integrations={CAL as unknown as Integrations[]}>
        <CalendarChannels />
      </CalendarWeekProvider>
    );
    expect(latest().shown).toEqual(allPostsBut());

    await click(tickOf('Client 2'));
    expect(latest().shown).toEqual(allPostsBut('two-shop', 'two-cafe'));

    // Ten Archive is disabled, so its post stays (C5)
    await click(tickOf('Client 10'));
    expect(latest().shown).toEqual(allPostsBut('two-shop', 'two-cafe', 'ten'));

    await click(tickOf('Client 2'));
    expect(latest().shown).toEqual(allPostsBut('ten'));

    await click(tickOf('Client 10'));
    expect(latest().shown).toEqual(allPostsBut());
    expect(latest().selection).toBeNull();
  });
});
