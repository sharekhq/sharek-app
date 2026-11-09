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
// These are the parts every mode shares, rendered in calendar mode, then the
// calendar's own: ticks, Show all, the row menu, the customer pencil and drag;
// then Samy's: picks, with no dimming and none of the calendar's extras; then
// Analytics': one choice, among the channels the page says have statistics.
// The test DOM has no layout, so sizes are pinned by the classes that carry
// them.
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
// Unlabelled, a control is named by what it holds, as a browser names it: its
// text and its pictures' alt in order, leaving out what's aria-hidden, the
// pieces joined by a space as the row's blocks are.
const contentOf = (node: Node): string[] => {
  if (node.nodeType === node.TEXT_NODE) return [node.textContent ?? ''];
  const el = node as Element;
  if (el.getAttribute('aria-hidden') === 'true') return [];
  if (el.tagName === 'IMG') return [el.getAttribute('alt') ?? ''];
  return Array.from(el.childNodes).flatMap(contentOf);
};
const nameOf = (el: Element) =>
  labelOf(el) ||
  contentOf(el)
    .map((text) => text.trim())
    .filter(Boolean)
    .join(' ');
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
// Collapsed, a row's main button is named for its channel, then its state
// after a · when it has one; the buttons beside it are the ! that fixes it.
const collapsedButton = (name: string) =>
  rowButtons(host).find((button) => labelOf(button).split(' · ')[0] === name)!;
const marksOf = (name: string) => {
  const main = collapsedButton(name);
  return Array.from(main.parentElement!.querySelectorAll('button')).filter(
    (button) => button !== main
  );
};
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

  // The rail never shows at 1025px and below, so collapsed with no channels
  // the + is the only way to add one (T043 review, finding 3).
  it.each([
    ['with channels', GROUPS],
    ['with none', []],
  ])(
    'keeps the + on the collapsed rail %s, stacked with Expand, offering the same two items',
    async (_, list) => {
      await render(list, { collapsed: true });
      const plus = control(host, 'add_a_channel');
      expect(plus).toHaveLength(1);
      expect(plus[0].getAttribute('aria-haspopup')).toBe('menu');
      // the collapsed rail fits one control a row
      const header = plus[0].parentElement;
      expect(control(host, 'expand')[0].parentElement).toBe(header);
      expect(classes(header)).toContain('flex-col');
      expect(classes(plus[0])).not.toContain('ms-auto');

      await click(plus[0]);
      const [add, invite, ...rest] = menuItems();
      expect(rest).toHaveLength(0);
      expect(leaf(add, 'add_channel')).toHaveLength(1);
      expect(leaf(add, 'add_channel_hint')).toHaveLength(1);
      expect(leaf(invite, 'invite_a_customer')).toHaveLength(1);
      expect(leaf(invite, 'invite_a_customer_hint')).toHaveLength(1);

      await click(add);
      expect(mockOpened).toEqual([[update]]);
    }
  );
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

  // The field the chats panel shares (agent.chats.tsx), where French's
  // "Rechercher des conversations" was cut with no ellipsis at 272px (walk 3)
  it('ends a placeholder or a name too long for it with an ellipsis', async () => {
    await render(SEARCH);

    expect(classes(search())).toContain('text-ellipsis');
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

  // one rule for both of the app's searches, the chats' too (agent.chats.tsx)
  it('matches a name whatever its accents, as the chats search does', async () => {
    await render([...SEARCH, channel('s-cafe', { name: 'Mocha Café' })]);

    await type(search(), 'CAFE');

    expect(shownNames()).toEqual(['Mocha Café']);
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

  // A row's picture and Check sit 8px inside it. The header's 4px and the
  // chevron button's 4px put the chevron over the pictures, and its 4px and
  // the 28px button's around the 20px box put the tick over the Checks (M8).
  it("sets the header's chevron and tick on the rows' columns", async () => {
    await render(GROUPS);
    const [chevron] = chevrons(groupOf('Client 2'));
    const header = chevron.parentElement!;
    const tick = header.querySelector('[role="checkbox"]')!;

    expect(classes(rowOf('Two Cafe'))).toContain('px-[8px]');
    expect(classes(header)).toContain('px-[4px]');
    expect(classes(chevron)).toContain('px-[4px]');
    expect(classes(tick)).toContain('w-[28px]');
    expect(classes(tick.firstElementChild)).toContain('w-[20px]');
  });

  // On a touch screen the tick's button is 44px, but a row's Check stays 20px
  // at the row's 8px. Centred, the box would sit 12px inside the button's end;
  // at its end, 4px in, it sits on the Checks again (M11).
  it("keeps the header's tick on the rows' Checks on a touch screen", async () => {
    await render(GROUPS);
    const [chevron] = chevrons(groupOf('Client 2'));
    const tick = chevron.parentElement!.querySelector('[role="checkbox"]')!;

    expect(classes(tick)).toEqual(
      expect.arrayContaining([
        'coarse:w-[44px]',
        'coarse:justify-end',
        'coarse:pe-[4px]',
      ])
    );
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

  it("runs them from the collapsed rail's !, while the picture still ticks", async () => {
    await render(ROWS, { collapsed: true });
    expect(marksOf('Noor Dental')).toHaveLength(1);
    expect(marksOf('Mona Saeed')).toHaveLength(1);

    await click(marksOf('Noor Dental')[0]);
    await flush();

    expect(mockFetch).toHaveBeenCalledWith(
      '/integrations/social/facebook?refresh=internal-dc',
      { method: 'GET' }
    );
    expect(window.location.href).toBe('https://auth.example/connect');

    await click(marksOf('Mona Saeed')[0]);
    await flush();

    expect(mockPush).toHaveBeenCalledWith(
      '/launches?added=linkedin&continue=setup'
    );
    expect(onChange).not.toHaveBeenCalled();

    await click(collapsedButton('Noor Dental'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toContain('dc');
    expect(mockFetch).toHaveBeenCalledTimes(1);
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

  // The maintainer's "Mark + clickable !" (T043 review, finding 2): the old
  // rail's red ! stays on the picture, as a button of its own beside the
  // picture's, never inside it, and the picture's name and tooltip say the
  // state. A disabled channel shows none, as an open row offers no fix.
  it('marks a disconnected or needs-setup channel with a red ! that fixes it, and names the state with the channel', async () => {
    await render(ROWS, { collapsed: true });
    const marked: Array<[string, string | null, string | null]> = [
      ['Lamsa Studio', null, null],
      ['بيت القهوة', null, null],
      ['Rawda Florist', null, null],
      ['Noor Dental', 'channel_disconnected', 'reconnect'],
      ['Mona Saeed', 'channel_needs_setup', 'finish_setup'],
      ['Sky Studio', 'channel_disconnected', 'reconnect'],
    ];

    marked.forEach(([name, state, action]) => {
      const main = collapsedButton(name);
      const label = state ? `${name} · ${state}` : name;
      expect(main.getAttribute('aria-label')).toBe(label);
      expect(main.getAttribute('data-tooltip-content')).toBe(label);
      expect(main.querySelector('button, [role="button"]')).toBeNull();

      const marks = marksOf(name);
      expect(marks.map(nameOf)).toEqual(action ? [action] : []);
      marks.forEach((mark) => {
        expect(mark.getAttribute('type')).toBe('button');
        expect(mark.textContent).toBe('!');
        expect(main.contains(mark)).toBe(false);
        // the post card's red ! (calendar.post.card.tsx), past the old rail's
        // 15px, on the picture's corner at the start
        expect(classes(mark.parentElement)).toContain('relative');
        expect(classes(mark)).toEqual(
          expect.arrayContaining([
            'absolute',
            'top-[2px]',
            '-start-[6px]',
            'w-[18px]',
            'h-[18px]',
            'rounded-full',
            'bg-error',
            'text-white',
          ])
        );
      });
    });
  });
});

// Walk 2 (T045): a row's checkbox read "facebook facebook AdFountain
// Facebook", the picture's and its badge's alt before the channel's name.
// Each picture sits in a control its channel already names, so it's
// decoration, on both pages and on the rail.
describe("the controls' names (walk 2)", () => {
  const USES = [
    ['the open list on the calendar', 'calendar', null, false],
    ['the open list on Samy', 'samy', [], false],
    ['the collapsed list on the calendar', 'calendar', null, true],
    ['the collapsed list on Samy', 'samy', [], true],
  ] as const;

  it.each(USES)(
    "names each row's checkbox once for its channel, its pictures decoration: %s",
    async (_, mode, selected, collapsed) => {
      await render(ROWS, { mode, selected, collapsed });
      // open, the second line follows the name; collapsed, a state follows it
      // after a ·
      const names: Array<[string, string, string | null]> = [
        ['Lamsa Studio', 'Instagram', null],
        ['بيت القهوة', 'YouTube', null],
        ['Rawda Florist', 'channel_disabled', null],
        ['Noor Dental', 'channel_disconnected', 'channel_disconnected'],
        ['Mona Saeed', 'channel_needs_setup', 'channel_needs_setup'],
        ['Sky Studio', 'channel_disconnected', 'channel_disconnected'],
      ];

      names.forEach(([name, line, state]) => {
        const main = collapsed ? collapsedButton(name) : mainButton(name);
        expect(main.getAttribute('role')).toBe('checkbox');
        expect(nameOf(main)).toBe(
          !collapsed ? `${name} ${line}` : state ? `${name} · ${state}` : name
        );
      });
      const pictures = Array.from(host.querySelectorAll('img'));
      expect(pictures).toHaveLength(ROWS.length * 2);
      pictures.forEach((img) => expect(img.getAttribute('alt')).toBe(''));
      // the Check beside an open row is the look of its checkbox, not another
      expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(
        ROWS.length
      );
    }
  );

  it.each(USES)(
    "names a customer's chevron for the customer and its count, and its tick for the customer: %s",
    async (_, mode, selected, collapsed) => {
      await render(GROUPS, { mode, selected, collapsed });
      const customers: Array<[string, number]> = [
        ['Client 2', 2],
        ['Client 10', 1],
      ];

      customers.forEach(([customer, count]) => {
        const group = groupOf(customer);
        expect(chevrons(group).map(nameOf)).toEqual([
          collapsed ? customer : `${customer} ${count}`,
        ]);
        const ticks = Array.from(
          group.querySelectorAll('[role="checkbox"]')
        ).filter((el) => !el.querySelector('img'));
        expect(ticks.map(nameOf)).toEqual(collapsed ? [] : [customer]);
      });
    }
  );
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
          // The collapsed rail's ! keeps its 18px: a 44px one would cover the
          // picture it marks, whose tap ticks, and the rail never shows at
          // 1025px and below (T043 review, finding 2).
          const mark = (el.textContent ?? '').trim() === '!';
          return !(ring && ((tall && wide) || mark));
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

  // SplitPanel's scroller insets everything by the rows' 8px. The board sets
  // the header 16px from the start and 10px from the end (12px on the sheet),
  // the hint 16px and the search 12px, so each takes the rest itself. The
  // search's is a margin: its icon is placed from the box around the field.
  it("insets the header, the hint and the search as the board does, inside SplitPanel's 8px", async () => {
    await render(SEARCH);
    const [block] = stickyBlocks();

    expect(classes(block.querySelector('h2')!.parentElement)).toEqual(
      expect.arrayContaining(['ps-[8px]', 'pe-[2px]', 'mobile:pe-[4px]'])
    );
    expect(classes(leaf(block, 'channel_hint_calendar')[0])).toContain(
      'px-[8px]'
    );
    const search = block.querySelector('input')!.parentElement!;
    expect(classes(search)).toContain('mx-[4px]');
    expect(classes(search).filter((name) => /^p[xse]-/.test(name))).toEqual([]);
  });

  it('keeps the collapsed header centred, with no inset of its own', async () => {
    await render(SEARCH, { collapsed: true });
    const [block] = stickyBlocks();
    const header = control(block, 'expand')[0].parentElement!;

    expect(
      classes(header).filter((name) => /^(mobile:)?p[xse]-/.test(name))
    ).toEqual([]);
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
const pictureOf = (name: string, list = CAL) =>
  Array.from(mainButton(name).querySelectorAll('img')).find(
    (img) =>
      img.getAttribute('src') === list.find((c) => c.name === name)!.picture
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
  // fill it, the old rail's tooltip condition, with that tooltip; under it,
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

  // The menu opens inside the wrapper, so the wrapper stays shown while it is
  // open too, or a click that doesn't focus the ⋯ (Safari's) would leave it
  // open and unseen once the pointer leaves the row.
  it('shows the ⋯ while its own row is hovered, while it has focus or its menu is open, and always on a touch screen', async () => {
    await render(CAL, { rowMenu });

    CAL.forEach(({ id, name }) => {
      const wrapper = document.querySelector(`[data-row-menu="${id}"]`)!
        .parentElement!;
      expect(classes(wrapper)).toEqual(
        expect.arrayContaining([
          'opacity-0',
          'group-hover:opacity-100',
          'focus-within:opacity-100',
          'has-[[aria-expanded=true]]:opacity-100',
          'coarse:opacity-100',
          'transition-opacity',
        ])
      );
      // its row is the group it answers to, and nothing around the row is
      // one, so another row's hover leaves it hidden
      expect(closestWith(wrapper, 'group')).toBe(rowOf(name));
      expect(closestWith(rowOf(name).parentElement!, 'group')).toBeNull();
    });
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

// Samy's picks (contracts/channel-panel.md, C20, FR-025). A tick means Samy
// may use the channel, and the page keeps the picked ids. A disabled,
// disconnected or needs-setup channel can't be picked, an unpicked row isn't
// dimmed, and there's no Show all, ⋯ menu, drag or pencil.
describe('isUsable on Samy (C20)', () => {
  it.each([
    ['an enabled channel', true, {}],
    ['a disconnected channel', false, { refreshNeeded: true }],
    ['a channel that needs setup', false, { inBetweenSteps: true }],
    ['a disabled channel', false, { disabled: true }],
    [
      'a disabled, disconnected channel',
      false,
      { disabled: true, refreshNeeded: true },
    ],
  ])('says %s is usable: %s', (_, usable, values) => {
    expect(isUsable(channel('u', values), 'samy')).toBe(usable);
  });
});

// No customer: a usable channel, then one disconnected, one that needs setup
// and one disabled. Client 2: two usable channels and a disconnected one.
// Noor Dental: one that needs setup, usable on the calendar but not on Samy.
const SAMY: Channel[] = [
  channel('lamsa', { name: 'Lamsa Studio' }),
  channel('mona', {
    name: 'Mona Saeed',
    identifier: 'linkedin',
    refreshNeeded: true,
  }),
  channel('zed', { name: 'Zed', identifier: 'x', inBetweenSteps: true }),
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
  channel('two-pages', {
    name: 'Two Pages',
    identifier: 'facebook',
    customer: CLIENT_2,
    refreshNeeded: true,
  }),
  channel('noor-setup', {
    name: 'Noor Clinic',
    identifier: 'facebook',
    customer: NOOR,
    inBetweenSteps: true,
  }),
];
const SAMY_USABLE = ['lamsa', 'two-shop', 'two-cafe'];
const renderSamy = (selected: string[]) =>
  render(SAMY, { mode: 'samy', selected });

describe('samy picks (C20, FR-025)', () => {
  it('makes each row a checkbox, checked while it is picked', async () => {
    await renderSamy(['two-shop']);

    SAMY.forEach(({ id, name }) => {
      const main = mainButton(name);
      expect(main.getAttribute('role')).toBe('checkbox');
      expect(main.getAttribute('aria-checked')).toBe(String(id === 'two-shop'));
      expect(ticked(name)).toBe(id === 'two-shop');
    });
  });

  it.each([
    [
      'picking a row adds its id',
      ['two-shop'],
      'Lamsa Studio',
      ['lamsa', 'two-shop'],
    ],
    [
      'unpicking a row drops its id',
      ['lamsa', 'two-shop'],
      'Two Shop',
      ['lamsa'],
    ],
    ['unpicking the last pick passes none', ['lamsa'], 'Lamsa Studio', []],
    [
      'picking the last usable channel passes every usable id, never null',
      ['two-shop', 'two-cafe'],
      'Lamsa Studio',
      SAMY_USABLE,
    ],
  ])('%s', async (_, selected, name, expected) => {
    await renderSamy(selected);

    await click(mainButton(name));

    expect(changedTo()).toEqual(sorted(expected));
  });

  it("does the same from the row's checkbox", async () => {
    await renderSamy([]);

    await click(checkboxOf('Two Cafe'));

    expect(changedTo()).toEqual(['two-cafe']);
  });

  it("can't pick a disconnected, needs-setup or disabled row, which reads unpicked and dims as the calendar's disabled rows do", async () => {
    await renderSamy([]);

    for (const { id, name } of SAMY) {
      if (SAMY_USABLE.includes(id)) continue;
      const main = mainButton(name);
      expect(main.getAttribute('aria-checked')).toBe('false');
      expect(main.getAttribute('aria-disabled')).toBe('true');
      expect(main.hasAttribute('disabled')).toBe(false);
      expect(
        chain(pictureOf(name, SAMY), rowOf(name)).some((el) =>
          has(el, 'opacity-50')
        )
      ).toBe(true);
      expect(
        chain(main.querySelector('bdi')!, rowOf(name)).some((el) =>
          has(el, 'opacity-50')
        )
      ).toBe(true);

      await click(main);
      await click(checkboxOf(name));
    }

    expect(onChange).not.toHaveBeenCalled();
  });

  // The page keeps the ids it was given, and a pick the list then reports
  // unusable leaves the panel's ticks, so the next change passes only the
  // picks the panel shows (C20).
  it('reads a pick that is no longer usable as unpicked, and leaves it out of the next change', async () => {
    await renderSamy(['two-shop', 'mona', 'archive']);
    ['Mona Saeed', 'Archive'].forEach((name) => {
      expect(mainButton(name).getAttribute('aria-checked')).toBe('false');
      expect(ticked(name)).toBe(false);
    });

    await click(mainButton('Lamsa Studio'));

    expect(changedTo()).toEqual(['lamsa', 'two-shop']);
  });

  it("doesn't dim an unpicked row: its picture in full colour, its name in text-ink, nothing faded", async () => {
    await renderSamy([]);

    SAMY.filter(({ id }) => SAMY_USABLE.includes(id)).forEach(({ name }) => {
      const row = rowOf(name);
      const bdi = mainButton(name).querySelector('bdi')!;
      expect(mainButton(name).getAttribute('aria-checked')).toBe('false');
      expect([row, ...within(row)].some((el) => has(el, 'grayscale'))).toBe(
        false
      );
      expect(classes(bdi)).toContain('text-ink');
      expect(classes(bdi)).not.toContain('text-muted');
      const faded = [...chain(row, host), ...within(row)].filter((el) =>
        classes(el).some(
          (cls) => /^opacity-\d+$/.test(cls) && cls !== 'opacity-100'
        )
      );
      expect(faded.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);
    });
  });
});

describe("a customer's tick on Samy (C20, FR-025)", () => {
  // The page keeps the picks, so a tick shows once the page hands it back.
  const SamyPage: FC<{ initial: string[] }> = ({ initial }) => {
    const [selected, setSelected] = useState(initial);
    return (
      <ChannelPanel
        mode="samy"
        channels={SAMY}
        selected={selected}
        onChange={(next: string[]) => {
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
    ['nothing', [], 'false'],
    ['one of its usable channels', ['two-shop'], 'mixed'],
    ['both its usable channels', ['two-shop', 'two-cafe'], 'true'],
    [
      'both, and its disconnected one',
      ['two-shop', 'two-cafe', 'two-pages'],
      'true',
    ],
  ])(
    'counts only its usable channels: with %s picked',
    async (_, selected, state) => {
      await renderSamy(selected);

      expect(nameOf(tickOf('Client 2'))).toBe('Client 2');
      expect(tickOf('Client 2').getAttribute('aria-checked')).toBe(state);
    }
  );

  it('picks all its usable channels, leaving the other picks as they were, and ticking it again drops them', async () => {
    await mount(<SamyPage initial={['lamsa']} />);

    await click(tickOf('Client 2'));

    expect(changedTo()).toEqual(['lamsa', 'two-cafe', 'two-shop']);
    expect(tickOf('Client 2').getAttribute('aria-checked')).toBe('true');
    expect(mainButton('Two Pages').getAttribute('aria-checked')).toBe('false');

    onChange.mockClear();
    await click(tickOf('Client 2'));

    expect(changedTo()).toEqual(['lamsa']);
    expect(tickOf('Client 2').getAttribute('aria-checked')).toBe('false');
  });

  it('picks the rest of its usable channels from mixed', async () => {
    await mount(<SamyPage initial={['two-shop']} />);

    await click(tickOf('Client 2'));

    expect(changedTo()).toEqual(['two-cafe', 'two-shop']);
    expect(tickOf('Client 2').getAttribute('aria-checked')).toBe('true');
  });

  it('is disabled when the customer has no usable channel, and changes nothing', async () => {
    await renderSamy([]);
    const tick = tickOf('Noor Dental');
    expect(isDisabled(tick)).toBe(true);

    await click(tick);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the hint and the extras on Samy (FR-007, FR-025)', () => {
  it('says what a tick means on Samy, in one 12px muted line', async () => {
    await renderSamy([]);
    const hint = leaf(host, 'channel_hint_samy');

    expect(hint).toHaveLength(1);
    expect(closestWith(hint[0], 'text-[12px]')).not.toBeNull();
    expect(closestWith(hint[0], 'text-muted')).not.toBeNull();
    expect(leaf(host, 'channel_hint_calendar')).toHaveLength(0);
  });

  it('has no Show all with nothing picked, and no ⋯ menu, drag or pencil, outside any DNDProvider', async () => {
    await renderSamy([]);

    expect(control(host, 'show_all')).toHaveLength(0);
    expect(control(host, 'edit_group_name')).toHaveLength(0);
    expect(host.querySelector('[draggable="true"]')).toBeNull();
    // beside its main button, a row has only Reconnect or Finish setup
    SAMY.forEach(({ name }) => {
      const beside = Array.from(rowOf(name).querySelectorAll('button'))
        .filter((button) => button !== mainButton(name))
        .map((button) => (button.textContent ?? '').trim())
        .filter((text) => text !== 'reconnect' && text !== 'finish_setup');
      expect(beside).toEqual([]);
    });
  });
});

// Analytics' own parts (contracts/channel-panel.md, C7, C20, FR-030). The page
// says which platforms have statistics, here every one but LinkedIn, and keeps
// the one id whose numbers show.
const hasStatistics = jest.fn(
  (c: Pick<Channel, 'identifier'>) => c.identifier !== 'linkedin'
);

describe('isUsable on Analytics (C7, C20)', () => {
  it.each([
    ['an enabled channel with statistics', true, {}],
    [
      'an enabled channel without statistics',
      false,
      { identifier: 'linkedin' },
    ],
    ['a disconnected channel', false, { refreshNeeded: true }],
    ['a channel that needs setup', false, { inBetweenSteps: true }],
    ['a disabled channel', false, { disabled: true }],
  ])('says %s is usable: %s', (_, usable, values) => {
    const subject = channel('u', values);

    expect(isUsable(subject, 'analytics', hasStatistics)).toBe(usable);
    // Samy's rule, and the page's word on the channel's platform
    expect(isUsable(subject, 'analytics', hasStatistics)).toBe(
      isUsable(subject, 'samy') && hasStatistics(subject)
    );
  });

  it("asks the page's predicate about the channel itself", () => {
    const subject = channel('u');

    isUsable(subject, 'analytics', hasStatistics);

    expect(hasStatistics).toHaveBeenCalledWith(subject);
  });
});

// No customer: a channel with numbers, one on a platform without, one
// disconnected, one disconnected on a platform without (its state comes
// first), one that needs setup and one disabled. Client 2: two with numbers.
// Noor Dental: one on a platform without.
const ANALYTICS: Channel[] = [
  channel('lamsa', { name: 'Lamsa Studio' }),
  channel('mona', { name: 'Mona Saeed', identifier: 'linkedin' }),
  channel('dc', {
    name: 'Noor Pages',
    identifier: 'facebook',
    refreshNeeded: true,
  }),
  channel('dc-li', {
    name: 'Rawda Profile',
    identifier: 'linkedin',
    refreshNeeded: true,
  }),
  channel('zed', { name: 'Zed', identifier: 'x', inBetweenSteps: true }),
  channel('archive', {
    name: 'Archive',
    identifier: 'facebook',
    disabled: true,
  }),
  channel('two-shop', {
    name: 'Two Shop',
    identifier: 'facebook',
    customer: CLIENT_2,
  }),
  channel('two-cafe', { name: 'Two Cafe', customer: CLIENT_2 }),
  channel('noor-li', {
    name: 'Noor Clinic',
    identifier: 'linkedin',
    customer: NOOR,
  }),
];
const ANALYTICS_USABLE = ['lamsa', 'two-shop', 'two-cafe'];
const renderAnalytics = (selected: string | null) =>
  render(ANALYTICS, { mode: 'analytics', selected, hasStatistics });
// The row's radio, a 20px round mark beside its main button.
const radioOf = (name: string) => {
  const found = within(rowOf(name)).filter(
    (el) =>
      has(el, 'w-[20px]') &&
      has(el, 'h-[20px]') &&
      has(el, 'rounded-full') &&
      !mainButton(name).contains(el)
  );
  expect(found).toHaveLength(1);
  return found[0];
};
const radios = () => Array.from(host.querySelectorAll('[role="radio"]'));

describe('the analytics choice (C20, FR-030)', () => {
  it('puts a radio per row in one radiogroup named Channels, around the customer groups', async () => {
    await renderAnalytics('two-shop');
    const groups = Array.from(host.querySelectorAll('[role="radiogroup"]'));

    expect(groups).toHaveLength(1);
    expect(labelOf(groups[0])).toBe('channels');
    expect(radios()).toHaveLength(ANALYTICS.length);
    ANALYTICS.forEach(({ id, name }) => {
      const main = mainButton(name);
      expect(main.getAttribute('role')).toBe('radio');
      expect(main.getAttribute('aria-checked')).toBe(String(id === 'two-shop'));
      expect(groups[0].contains(main)).toBe(true);
    });
    ['Client 2', 'Noor Dental'].forEach((customer) =>
      expect(groups[0].contains(groupOf(customer))).toBe(true)
    );
  });

  it.each([
    ['its main button', (name: string) => mainButton(name)],
    ['its radio', radioOf],
  ])("calls onChange with the row's id alone, from %s", async (_, target) => {
    await renderAnalytics('two-shop');

    await click(target('Two Cafe'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('two-cafe');
  });

  it('tints the chosen row and sets its name bold, with its radio filled, and the others neither', async () => {
    await renderAnalytics('two-shop');

    ANALYTICS.forEach(({ id, name }) => {
      const chosen = id === 'two-shop';
      const row = rowOf(name);
      const bdi = mainButton(name).querySelector('bdi')!;
      expect(has(row, 'bg-brandSoft2')).toBe(chosen);
      // a hover tint of its own would replace the chosen row's
      expect(has(row, 'hover:bg-boxHover')).toBe(!chosen);
      expect(classes(bdi)).toContain(chosen ? 'font-[600]' : 'font-[500]');
      expect(classes(bdi)).not.toContain(chosen ? 'font-[500]' : 'font-[600]');
      // chosen by a mark, never by colour alone
      expect(radioOf(name).children).toHaveLength(chosen ? 1 : 0);
    });
  });

  it("doesn't dim a row that isn't chosen: its picture in full colour, its name in text-ink", async () => {
    await renderAnalytics('two-shop');

    ['Lamsa Studio', 'Two Cafe'].forEach((name) => {
      const row = rowOf(name);
      expect([row, ...within(row)].some((el) => has(el, 'grayscale'))).toBe(
        false
      );
      expect(classes(mainButton(name).querySelector('bdi'))).toContain(
        'text-ink'
      );
      expect(
        [...chain(row, host), ...within(row)].some((el) =>
          classes(el).some(
            (cls) => /^opacity-\d+$/.test(cls) && cls !== 'opacity-100'
          )
        )
      ).toBe(false);
    });
  });

  it.each([
    [
      'a platform without statistics',
      'Mona Saeed',
      'no_statistics_for_platform',
      [],
    ],
    [
      'a platform without statistics, for a customer',
      'Noor Clinic',
      'no_statistics_for_platform',
      [],
    ],
    [
      'a disconnected channel',
      'Noor Pages',
      'channel_disconnected',
      ['reconnect'],
    ],
    [
      'a disconnected channel on a platform without statistics',
      'Rawda Profile',
      'channel_disconnected',
      ['reconnect'],
    ],
    [
      'a channel that needs setup',
      'Zed',
      'channel_needs_setup',
      ['finish_setup'],
    ],
    // under the plan's limit, so disabled by hand
    ['a disabled channel', 'Archive', 'channel_disabled', []],
  ])(
    "can't choose %s, which says why, offers its fix beside it, and dims as the calendar's disabled rows do",
    async (_, name, state, actions) => {
      await renderAnalytics(null);
      const main = mainButton(name);

      expect(main.getAttribute('aria-checked')).toBe('false');
      expect(main.getAttribute('aria-disabled')).toBe('true');
      expect(main.hasAttribute('disabled')).toBe(false);
      const lines = secondLine(name);
      expect(lines).toHaveLength(1);
      expect((lines[0].textContent ?? '').trim()).toBe(state);
      ['reconnect', 'finish_setup'].forEach((text) =>
        expect(besideButtons(name, text)).toHaveLength(
          actions.includes(text) ? 1 : 0
        )
      );
      expect(
        chain(pictureOf(name, ANALYTICS), rowOf(name)).some((el) =>
          has(el, 'opacity-50')
        )
      ).toBe(true);
      expect(
        chain(main.querySelector('bdi')!, rowOf(name)).some((el) =>
          has(el, 'opacity-50')
        )
      ).toBe(true);
      // its radio stays, faded with it
      expect(
        chain(radioOf(name), rowOf(name)).some((el) => has(el, 'opacity-50'))
      ).toBe(true);

      await click(main);
      await click(radioOf(name));

      expect(onChange).not.toHaveBeenCalled();
    }
  );

  it('says nothing of statistics on a row whose platform has them', async () => {
    await renderAnalytics(null);

    ANALYTICS.filter(({ id }) => ANALYTICS_USABLE.includes(id)).forEach(
      ({ name }) =>
        expect(secondLine(name).map((el) => el.textContent)).not.toContain(
          'no_statistics_for_platform'
        )
    );
  });

  // The page keeps the id it was given, and a channel the list then reports
  // unusable reads unchosen, so the page's fallback can choose another (C20).
  it('reads a choice that is no longer usable as unchosen, untinted', async () => {
    await renderAnalytics('dc');

    expect(mainButton('Noor Pages').getAttribute('aria-checked')).toBe('false');
    expect(has(rowOf('Noor Pages'), 'bg-brandSoft2')).toBe(false);
    expect(radioOf('Noor Pages').children).toHaveLength(0);
  });

  it("gives a customer its header and no tick: there's no checkbox in the list", async () => {
    await renderAnalytics('two-shop');

    ['Client 2', 'Noor Dental'].forEach((customer) =>
      expect(chevrons(groupOf(customer))).toHaveLength(1)
    );
    expect(host.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  });
});

// The ARIA radio pattern: the radios are one Tab stop, and the arrow keys move
// to the next channel that can be picked, or the one before, and pick it,
// wrapping. In the list's order: Noor Pages, Lamsa Studio, Mona Saeed, Rawda
// Profile, Zed, Archive, then Client 2's Two Shop and Two Cafe, then Noor
// Dental's Noor Clinic; Lamsa Studio, Two Shop and Two Cafe can be picked.
describe('the analytics radios from the keyboard (FR-052)', () => {
  const press = async (node: Element, key: string) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      node.dispatchEvent(event);
    });
    return event;
  };
  const tabStops = () =>
    radios()
      .filter((radio) => radio.getAttribute('tabindex') === '0')
      .map(rowName);

  afterEach(() => {
    document.dir = 'ltr';
  });

  it.each([
    ['the chosen channel', 'two-shop', 'Two Shop'],
    ['the first that can be picked with none chosen', null, 'Lamsa Studio'],
    [
      'the first that can be picked with the chosen one unusable',
      'dc',
      'Lamsa Studio',
    ],
  ])('makes them one Tab stop, %s', async (_, selected, name) => {
    await renderAnalytics(selected);

    expect(tabStops()).toEqual([name]);
    radios()
      .filter((radio) => rowName(radio) !== name)
      .forEach((radio) => expect(radio.getAttribute('tabindex')).toBe('-1'));
    // a row's fix and a customer's header keep their own Tab stops
    expect(
      besideButtons('Noor Pages', 'reconnect')[0].hasAttribute('tabindex')
    ).toBe(false);
    expect(chevrons(groupOf('Client 2'))[0].hasAttribute('tabindex')).toBe(
      false
    );
  });

  it("leaves the calendar's checkboxes each a Tab stop", async () => {
    await render(CAL);

    expect(
      rowButtons(host).filter((button) => button.hasAttribute('tabindex'))
    ).toEqual([]);
  });

  it('moves with ArrowDown and ArrowRight to the next channel that can be picked, focusing and picking it, wrapping', async () => {
    await renderAnalytics('lamsa');

    const first = await press(mainButton('Lamsa Studio'), 'ArrowDown');
    expect(first.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith('two-shop');
    expect(document.activeElement).toBe(mainButton('Two Shop'));

    await press(mainButton('Two Shop'), 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('two-cafe');
    expect(document.activeElement).toBe(mainButton('Two Cafe'));

    // past Noor Clinic, then round to the top, past Noor Pages
    await press(mainButton('Two Cafe'), 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith('lamsa');
    expect(document.activeElement).toBe(mainButton('Lamsa Studio'));
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("moves back with ArrowUp and ArrowLeft, wrapping, and from a row that can't be picked too", async () => {
    await renderAnalytics('lamsa');

    await press(mainButton('Lamsa Studio'), 'ArrowUp');
    expect(onChange).toHaveBeenLastCalledWith('two-cafe');
    expect(document.activeElement).toBe(mainButton('Two Cafe'));

    await press(mainButton('Two Cafe'), 'ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('two-shop');

    // a disabled row a click focused
    await press(mainButton('Mona Saeed'), 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith('two-shop');
    await press(mainButton('Mona Saeed'), 'ArrowUp');
    expect(onChange).toHaveBeenLastCalledWith('lamsa');
  });

  it('runs the horizontal pair the other way in Arabic, and Down and Up as before', async () => {
    document.dir = 'rtl';
    await renderAnalytics('lamsa');

    await press(mainButton('Lamsa Studio'), 'ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('two-shop');
    await press(mainButton('Two Shop'), 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('lamsa');
    await press(mainButton('Lamsa Studio'), 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith('two-shop');
    await press(mainButton('Two Shop'), 'ArrowUp');
    expect(onChange).toHaveBeenLastCalledWith('lamsa');
  });

  // A radio in a closed customer group is display:none in a browser, so it
  // can't take the focus; the test DOM has no CSS, so its focus is held back.
  it("passes over a radio that can't take the focus", async () => {
    await renderAnalytics('lamsa');
    mainButton('Two Shop').focus = () => undefined;

    await press(mainButton('Lamsa Studio'), 'ArrowDown');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('two-cafe');
    expect(document.activeElement).toBe(mainButton('Two Cafe'));
  });

  it("leaves other keys, and the arrows on a row's fix, to the browser", async () => {
    await renderAnalytics('lamsa');

    expect(
      (await press(mainButton('Lamsa Studio'), 'Enter')).defaultPrevented
    ).toBe(false);
    expect(
      (await press(besideButtons('Noor Pages', 'reconnect')[0], 'ArrowDown'))
        .defaultPrevented
    ).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the hint on Analytics (FR-007)', () => {
  it('says what a choice means on Analytics, in one 12px muted line', async () => {
    await renderAnalytics(null);
    const hint = leaf(host, 'channel_hint_analytics');

    expect(hint).toHaveLength(1);
    expect(closestWith(hint[0], 'text-[12px]')).not.toBeNull();
    expect(closestWith(hint[0], 'text-muted')).not.toBeNull();
    expect(leaf(host, 'channel_hint_calendar')).toHaveLength(0);
    expect(leaf(host, 'channel_hint_samy')).toHaveLength(0);
  });
});
