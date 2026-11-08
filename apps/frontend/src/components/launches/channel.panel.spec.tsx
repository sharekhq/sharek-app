import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';
import { orderBy, uniqBy } from 'lodash';

// The channel list that Calendar, Samy and Analytics share (spec 051,
// contracts/channel-panel.md): one order, a header with + and the rail's
// controls, a one-line hint, a search past 6 channels, customer groups that
// remember being closed, rows with a picture, a name in its own direction and
// a second line, and Reconnect and Finish setup beside a row, never inside it.
// These are the parts every mode shares, rendered in calendar mode, the only
// mode increment 2 has. The test DOM has no layout, so sizes are pinned by the
// classes that carry them.
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

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
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

const render = async (
  channels: Channel[],
  values: Record<string, unknown> = {}
) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
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
  });
  return host;
};

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
    ['en', 'Rawda Florist', 'channel_disabled_over_plan'],
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
