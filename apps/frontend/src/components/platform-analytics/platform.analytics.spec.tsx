import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

// Analytics (spec 051, pages-ui.md): the numbers first, then the shared
// channel list in analytics mode at the end, in either direction. The page
// reads the channels only through the shared useIntegrationList, keeps the
// chosen channel by id, and falls back to the first channel in the list's
// order that can be picked, through isUsable (R21, C20). It tells the list
// which platforms have statistics (C7). Its top bar names the channel and
// offers the platform's periods as radios (R22). At 1025px and below a
// channel button opens the list as SplitPanel's sheet, and the picture strip
// is gone (FR-042, C10).
//
// What is under test is the page's own wiring, so the channel panel,
// SplitPanel and the numbers are markers that record what the page hands
// them; isUsable and orderChannels are the real ones. useT gives `tr:` and the
// key, and records its calls. platformLabel reads i18next itself, which runs
// on the en file.
type Channel = ReturnType<typeof channel>;
type AnalyticsPanel = Extract<
  ComponentProps<typeof ChannelPanel>,
  { mode: 'analytics' }
>;

// The list as GET /integrations/list gives it; a case reassigns it to refresh.
let mockChannels: Channel[] = [];
const mockMutate = jest.fn();
let mockDisableX = false;
// The collapseMenu cookie the three pages share, and what was written to it.
let mockCollapse = '0';
const mockSetCookie = jest.fn();
// The keys of anything the page loads itself.
const mockKeys: unknown[] = [];
const mockShow = jest.fn();
const mockPush = jest.fn();
const mockT = jest.fn((key: string) => `tr:${key}`);
// What the page last handed each marker: SplitPanel, the channel panel, and
// the numbers, by the channel's id and the period.
let mockSplit: ComponentProps<typeof SplitPanel> | undefined;
let mockPanel: AnalyticsPanel | undefined;
let mockShown: { id: string; date: number } | undefined;
// Each mount of the numbers, by the channel's id and the period.
const mockMounts: string[] = [];

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      isLoading: false,
      data: mockChannels,
      mutate: mockMutate,
    }),
  })
);
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: unknown) => {
    mockKeys.push(key);
    return { data: undefined, isLoading: false, mutate: () => undefined };
  },
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
// Kept in state, as react-use-cookie keeps it.
jest.mock('react-use-cookie', () => {
  const { useState } = jest.requireActual('react');
  const useCookieMock = (name: string, initial: string) => {
    const [value, setValue] = useState(
      name === 'collapseMenu' ? mockCollapse : initial
    );
    return [
      value,
      (next: string) => {
        mockSetCookie(name, next);
        setValue(next);
      },
    ];
  };
  return { __esModule: true, default: useCookieMock };
});
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ disableXAnalytics: mockDisableX }),
}));
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplit = props;
    return <div data-testid="split-panel">{props.children}</div>;
  },
}));
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/channel.panel'),
  ChannelPanel: (props: AnalyticsPanel) => {
    mockPanel = props;
    return <div data-testid="channel-panel" />;
  },
}));
// Scenery: the channel panel's module loads for isUsable and orderChannels.
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);
// The tiles and charts are T089's; only what they are drawn for is under
// test here, and each time they are drawn anew, as SWR loads on mount.
jest.mock(
  '@gitroom/frontend/components/platform-analytics/render.analytics',
  () => {
    const { useState } = jest.requireActual('react');
    return {
      RenderAnalytics: ({
        integration,
        date,
      }: {
        integration: { id: string };
        date: number;
      }) => {
        useState(() => mockMounts.push(`${integration.id}-${date}`));
        mockShown = { id: integration.id, date };
        return <div data-chart={integration.id} data-date={date} />;
      },
    };
  }
);

import i18next from 'i18next';
import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';
import {
  ChannelPanel,
  isUsable,
} from '@gitroom/frontend/components/launches/channel.panel';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

function channel(
  id: string,
  identifier: string,
  name: string,
  values: Record<string, unknown> = {}
) {
  return {
    id,
    internalId: `internal-${id}`,
    identifier,
    name,
    picture: `https://cdn.example.com/${id}.png`,
    type: 'social',
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    customer: null as { id: string; name: string } | null,
    ...values,
  };
}

const ACME = { id: 'c-acme', name: 'Acme' };
const BAYT = { id: 'c-bayt', name: 'Bayt Al Qahwa' };

// The platforms upstream's page lists as having statistics, and some that
// have none.
const WITH_STATISTICS = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'tiktok-business',
  'youtube',
  'gmb',
  'pinterest',
  'threads',
  'x',
];
const WITHOUT_STATISTICS = ['linkedin', 'bluesky', 'mastodon', 'reddit'];

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: {
        translation: JSON.parse(
          fs.readFileSync(
            path.join(
              __dirname,
              '../../../../../libraries/react-shared-libraries/src/translation/locales/en/translation.json'
            ),
            'utf8'
          )
        ),
      },
    },
  });
});

const mounted: Root[] = [];
let host: HTMLElement;

// The page in a host, and a way to render it again, as a list refresh does.
const mount = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const render = async () => {
    await act(async () => {
      root.render(<PlatformAnalytics />);
    });
  };
  await render();
  return render;
};
const unmountAll = () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
};
const run = async (callback: () => unknown) => {
  await act(async () => {
    await callback();
  });
};
const click = (node: Element) =>
  run(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const press = async (node: Element, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  await run(() => node.dispatchEvent(event));
  return event;
};

const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
// The nearest element, from node up, that carries the class.
const withClass = (node: Element, className: string) => {
  let at: Element | null = node;
  while (at && !classes(at).includes(className)) at = at.parentElement;
  return at;
};
// The page's row, and its children in order: the panel each SplitPanel holds,
// or the content.
const row = () => host.firstElementChild!;
const layout = () =>
  Array.from(row().children).map((child) =>
    child.getAttribute('data-testid') === 'split-panel'
      ? child
          .querySelector('[data-testid$="-panel"]')
          ?.getAttribute('data-testid')
      : 'content'
  );
const chart = () => host.querySelector('[data-chart]');
const periods = () =>
  host.querySelector('[role="radiogroup"][aria-label="tr:period"]');
const radios = () =>
  Array.from(periods()!.querySelectorAll('[role="radio"]')) as HTMLElement[];
const checked = () =>
  radios().map((radio) => radio.getAttribute('aria-checked'));
const channelButton = () =>
  host.querySelector('button[aria-label="tr:change_channel_named"]');
// Whatever opens the sheet, named or not: the only button that says whether
// it is open.
const sheetButton = () => host.querySelector('button[aria-expanded]');
// The leaf that reads exactly `text`.
const leaf = (root: Element, text: string) =>
  Array.from(root.querySelectorAll('*')).find(
    (node) => node.children.length === 0 && node.textContent === text
  );

beforeEach(() => {
  // The list's order: the channels with no customer, Instagram then the
  // LinkedIn profile, which has no statistics; then Acme's; then Bayt Al
  // Qahwa's. Not the order they come in, nor the platforms' order.
  mockChannels = [
    channel('bf', 'facebook', 'Bayt Page', { customer: BAYT }),
    channel('ln', 'linkedin', 'Moataz'),
    channel('ig', 'instagram', 'Sharek Gram'),
    channel('af', 'facebook', 'Acme Page', { customer: ACME }),
  ];
  mockDisableX = false;
  mockCollapse = '0';
  mockKeys.length = 0;
  mockSplit = undefined;
  mockPanel = undefined;
  mockShown = undefined;
  mockMounts.length = 0;
});

afterEach(() => {
  unmountAll();
  jest.clearAllMocks();
  document.dir = 'ltr';
});

describe('the layout (FR-001, C6)', () => {
  it('puts the numbers first and the channel list at the end, in a 288px SplitPanel named Channels', async () => {
    await mount();

    expect(layout()).toEqual(['content', 'channel-panel']);
    expect(row().children[0].contains(chart())).toBe(true);
    expect(mockSplit).toEqual(
      expect.objectContaining({
        label: 'tr:channels',
        width: 'w-[288px]',
        open: false,
        collapsed: false,
      })
    );
  });

  it('stacks the page through its own wrapper at 1025px and below, with nothing left at the phone screen', async () => {
    await mount();

    expect(classes(row())).toEqual(
      expect.arrayContaining(['min-w-0', 'mobile:flex-col'])
    );
    expect(classes(row().children[0])).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', 'mobile:p-[12px]'])
    );
    expect(row().outerHTML).not.toMatch(/\bphone:/);
  });
});

describe('the channel list (FR-008, FR-030, C7)', () => {
  it("is ChannelPanel in analytics mode on useIntegrationList's list, with nothing loaded by the page itself", async () => {
    await mount();

    expect(mockPanel).toEqual(
      expect.objectContaining({ mode: 'analytics', collapsed: false })
    );
    // every channel, the LinkedIn profile with no statistics too
    expect(mockPanel!.channels).toEqual(mockChannels);
    // no analytics-list of its own
    expect(mockKeys).toEqual([]);
    // the calendar's ⋯ menu, drag and customer rename stay the calendar's
    expect(mockPanel!.rowMenu).toBeUndefined();
    expect(mockPanel!.onMoveToCustomer).toBeUndefined();
    expect(mockPanel!.onRenameCustomer).toBeUndefined();

    // Add Channel, Invite and Reconnect refresh the shared list
    await run(() => mockPanel!.update());
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("tells the list which platforms have statistics, so the list's rule can't pick a LinkedIn profile", async () => {
    await mount();
    const has = (identifier: string) =>
      mockPanel!.hasStatistics(channel('p', identifier, 'P'));

    expect(WITH_STATISTICS.filter((identifier) => !has(identifier))).toEqual(
      []
    );
    expect(WITHOUT_STATISTICS.filter(has)).toEqual([]);
    expect(
      isUsable(mockChannels[1], 'analytics', mockPanel!.hasStatistics)
    ).toBe(false);
    expect(
      isUsable(mockChannels[2], 'analytics', mockPanel!.hasStatistics)
    ).toBe(true);
  });

  it("collapses to the icon rail and back from the panel's own control, on the shared collapseMenu cookie", async () => {
    mockCollapse = '1';
    await mount();
    expect(mockPanel!.collapsed).toBe(true);
    expect(mockSplit!.collapsed).toBe(true);

    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCookie).toHaveBeenLastCalledWith('collapseMenu', '0');
    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplit!.collapsed).toBe(false);

    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCookie).toHaveBeenLastCalledWith('collapseMenu', '1');
    expect(mockPanel!.collapsed).toBe(true);
  });
});

describe('the chosen channel (R21, C20, FR-030)', () => {
  it("is the first channel in the list's order that can be picked, to begin with, and the list marks it", async () => {
    await mount();

    expect(mockShown).toEqual({ id: 'ig', date: 7 });
    expect(chart()!.getAttribute('data-chart')).toBe('ig');
    expect(mockPanel!.selected).toBe('ig');
  });

  it('is the one the list reports chosen, by its id', async () => {
    await mount();

    await run(() => mockPanel!.onChange('bf'));

    expect(mockShown).toEqual({ id: 'bf', date: 7 });
    expect(chart()!.getAttribute('data-chart')).toBe('bf');
    expect(mockPanel!.selected).toBe('bf');
  });

  it('stays chosen by its id when the list refreshes in another order', async () => {
    const render = await mount();
    await run(() => mockPanel!.onChange('bf'));

    // a new channel with no customer comes first in the list's order now
    mockChannels = [
      channel('n1', 'facebook', 'Another Page'),
      ...[...mockChannels].reverse(),
    ];
    await render();

    expect(mockShown!.id).toBe('bf');
    expect(mockPanel!.selected).toBe('bf');
  });

  it.each([
    ['disconnected', { refreshNeeded: true }],
    ['as needing setup', { inBetweenSteps: true }],
    ['disabled', { disabled: true }],
  ])(
    "falls back to the first channel in the list's order that can be picked when the chosen one is reported %s",
    async (_, state) => {
      const render = await mount();
      await run(() => mockPanel!.onChange('bf'));

      mockChannels = mockChannels.map((item) =>
        ['bf', 'ig'].includes(item.id) ? { ...item, ...state } : item
      );
      await render();

      // past Instagram, reported so too, and the LinkedIn profile, which has
      // no statistics
      expect(mockShown!.id).toBe('af');
      expect(mockPanel!.selected).toBe('af');
      expect(mockPanel!.channels).toEqual(mockChannels);
    }
  );

  it('falls back the same way when the chosen channel leaves the list', async () => {
    const render = await mount();
    await run(() => mockPanel!.onChange('af'));
    expect(mockShown!.id).toBe('af');

    mockChannels = mockChannels.filter(({ id }) => id !== 'af');
    await render();

    expect(mockShown!.id).toBe('ig');
    expect(mockPanel!.selected).toBe('ig');
  });

  it('draws the numbers anew for each channel and period, so a switch back loads them again, and a list refresh does not', async () => {
    const render = await mount();
    expect(mockMounts).toEqual(['ig-7']);

    await run(() => mockPanel!.onChange('af'));
    await run(() => mockPanel!.onChange('ig'));
    await click(radios()[1]);
    expect(mockMounts).toEqual(['ig-7', 'af-7', 'ig-7', 'ig-30']);

    mockChannels = [...mockChannels].reverse();
    await render();
    expect(mockMounts).toHaveLength(4);
  });

  // The listed channels are there, so connecting one isn't the way: their rows
  // say why each can't be picked and offer Reconnect or Finish setup.
  it('says to pick a channel beside the list when none can be picked, with no call to connect one', async () => {
    mockChannels = [
      channel('ln', 'linkedin', 'Moataz'),
      channel('off', 'facebook', 'Off Page', { disabled: true }),
      channel('dc', 'instagram', 'Gone Gram', { refreshNeeded: true }),
    ];
    await mount();

    expect(layout()).toEqual(['content', 'channel-panel']);
    const content = row().children[0];
    const hint = Array.from(content.querySelectorAll('h2')).find(
      (heading) => heading.textContent === 'tr:channel_hint_analytics'
    );
    expect(hint).toBeDefined();
    // the phone's channel button says it there
    expect(withClass(hint!, 'mobile:hidden')).not.toBeNull();
    [
      'tr:analytics_empty_title',
      'tr:analytics_empty_description',
      'tr:works_with',
      'tr:connect_a_channel',
    ].forEach((text) => expect(content.textContent).not.toContain(text));
    expect(mockPush).not.toHaveBeenCalled();
    expect(chart()).toBeNull();
    expect(periods()).toBeNull();
    expect(mockPanel!.channels).toEqual(mockChannels);
    expect(mockPanel!.selected).toBeNull();
  });

  it("shows Sharek's empty state with no channel at all, beside the list's own, and sends people to connect one", async () => {
    mockChannels = [];
    await mount();

    expect(layout()).toEqual(['content', 'channel-panel']);
    expect(row().children[0].textContent).toContain('tr:analytics_empty_title');
    expect(mockPanel!.channels).toEqual([]);
    // nothing to pick from, so no channel button on a phone
    expect(sheetButton()).toBeNull();

    const connect = Array.from(host.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('tr:connect_a_channel')
    )!;
    await click(connect);
    expect(mockPush).toHaveBeenCalledWith('/launches');
  });
});

describe('X (C7, R21)', () => {
  it('has statistics, and none while disableXAnalytics is set, when it stays listed but is not picked', async () => {
    mockChannels = [
      channel('xx', 'x', 'Sharek X'),
      channel('af', 'facebook', 'Acme Page', { customer: ACME }),
    ];
    await mount();
    expect(mockPanel!.hasStatistics(mockChannels[0])).toBe(true);
    expect(mockShown!.id).toBe('xx');

    unmountAll();
    mockDisableX = true;
    await mount();

    expect(mockPanel!.hasStatistics(mockChannels[0])).toBe(false);
    expect(mockPanel!.channels).toEqual(mockChannels);
    expect(mockShown!.id).toBe('af');
  });
});

describe('the top bar (FR-031, R22)', () => {
  it("shows the chosen channel's 40px picture with its badge, its name, and its platform and customer", async () => {
    await mount();
    await run(() => mockPanel!.onChange('bf'));

    const picture = host.querySelector(
      'img[src="https://cdn.example.com/bf.png"][width="40"]'
    )!;
    expect(picture.getAttribute('height')).toBe('40');
    const badge = picture.parentElement!.querySelector(
      'img[src="/icons/platforms/facebook.png"]'
    )!;
    expect(badge.getAttribute('width')).toBe('16');
    expect(badge.getAttribute('height')).toBe('16');
    // the bar's own, which the phone's channel button replaces
    const identity = withClass(picture, 'mobile:hidden')!;
    expect(identity.querySelector('bdi')!.textContent).toBe('Bayt Page');
    expect(
      leaf(identity, `${platformLabel('facebook')} · Bayt Al Qahwa`)
    ).toBeDefined();

    // with no customer, the platform alone
    await run(() => mockPanel!.onChange('ig'));
    const own = withClass(
      host.querySelector(
        'img[src="https://cdn.example.com/ig.png"][width="40"]'
      )!,
      'mobile:hidden'
    )!;
    expect(own.querySelector('bdi')!.textContent).toBe('Sharek Gram');
    expect(leaf(own, platformLabel('instagram'))).toBeDefined();
  });

  it("offers only the platform's periods as radios named Period, the chosen one marked by more than colour, and choosing one loads it", async () => {
    await mount();

    // Instagram has 7 and 30 days
    expect(radios().map((radio) => radio.textContent)).toEqual([
      'tr:last_7_days',
      'tr:last_30_days',
    ]);
    expect(checked()).toEqual(['true', 'false']);
    expect(mockShown).toEqual({ id: 'ig', date: 7 });

    // Facebook has 90 days too
    await run(() => mockPanel!.onChange('af'));
    expect(radios().map((radio) => radio.textContent)).toEqual([
      'tr:last_7_days',
      'tr:last_30_days',
      'tr:last_90_days',
    ]);
    expect(
      radios().every(
        (radio) =>
          radio.tagName === 'BUTTON' && radio.getAttribute('type') === 'button'
      )
    ).toBe(true);

    await click(radios()[2]);
    expect(mockShown).toEqual({ id: 'af', date: 90 });
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect(classes(radios()[2])).toEqual(
      expect.arrayContaining(['bg-brandSoft', 'text-brandText', 'font-[600]'])
    );
    expect(classes(radios()[0])).not.toContain('bg-brandSoft');
  });

  // The ARIA radio pattern: Period is one Tab stop, the checked period, and
  // the arrow keys move to the next period or the one before and pick it,
  // wrapping, the horizontal pair the other way in Arabic, as the radios run.
  it.each([
    ['ltr', 'ArrowRight', 'ArrowLeft'],
    ['rtl', 'ArrowLeft', 'ArrowRight'],
  ])(
    'makes Period one Tab stop, and in %s moves on with %s and back with %s, picking as it goes, wrapping',
    async (dir, next, back) => {
      document.dir = dir;
      await mount();
      await run(() => mockPanel!.onChange('af'));
      const tabStops = () =>
        radios().map((radio) => radio.getAttribute('tabindex'));
      expect(tabStops()).toEqual(['0', '-1', '-1']);

      const first = await press(radios()[0], next);
      expect(first.defaultPrevented).toBe(true);
      expect(mockShown).toEqual({ id: 'af', date: 30 });
      expect(document.activeElement).toBe(radios()[1]);
      expect(tabStops()).toEqual(['-1', '0', '-1']);

      await press(radios()[1], 'ArrowDown');
      expect(mockShown!.date).toBe(90);
      // past the last, the first
      await press(radios()[2], next);
      expect(mockShown!.date).toBe(7);
      expect(document.activeElement).toBe(radios()[0]);
      // and back past the first, the last
      await press(radios()[0], back);
      expect(mockShown!.date).toBe(90);
      await press(radios()[2], 'ArrowUp');
      expect(mockShown!.date).toBe(30);
      expect(checked()).toEqual(['false', 'true', 'false']);
      expect(document.activeElement).toBe(radios()[1]);

      expect((await press(radios()[1], 'Enter')).defaultPrevented).toBe(false);
      expect(mockShown!.date).toBe(30);
    }
  );

  it('keeps the period on a channel switch where the platform has it, and takes its first where it has not', async () => {
    await mount();
    await run(() => mockPanel!.onChange('af'));
    await click(radios()[1]);

    await run(() => mockPanel!.onChange('bf'));
    expect(mockShown).toEqual({ id: 'bf', date: 30 });
    expect(checked()).toEqual(['false', 'true', 'false']);

    await click(radios()[2]);
    await run(() => mockPanel!.onChange('ig'));
    expect(mockShown).toEqual({ id: 'ig', date: 7 });
    expect(checked()).toEqual(['true', 'false']);
  });
});

describe('at 1025px and below (FR-042, FR-043)', () => {
  it('opens the sheet, never as the icon rail, from a button showing the channel, labelled change_channel_named; Done and SplitPanel close it', async () => {
    mockCollapse = '1';
    await mount();
    await run(() => mockPanel!.onChange('bf'));

    const button = channelButton()!;
    expect(classes(button)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
    expect(mockT).toHaveBeenCalledWith(
      'change_channel_named',
      expect.any(String),
      expect.objectContaining({
        name: 'Bayt Page',
        platform: platformLabel('facebook'),
      })
    );
    // the picture, the name, and the platform and customer
    expect(
      button.querySelector('img[src="https://cdn.example.com/bf.png"]')
    ).not.toBeNull();
    expect(button.querySelector('bdi')!.textContent).toBe('Bayt Page');
    expect(
      leaf(button, `${platformLabel('facebook')} · Bayt Al Qahwa`)
    ).toBeDefined();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(mockSplit!.open).toBe(false);

    await click(button);
    expect(mockSplit!.open).toBe(true);
    expect(channelButton()!.getAttribute('aria-expanded')).toBe('true');
    expect(mockSplit!.collapsed).toBe(false);
    expect(mockPanel!.collapsed).toBe(false);
    // the rail stays as it was for a wide screen
    expect(mockSetCookie).not.toHaveBeenCalled();

    await run(() => mockPanel!.onDone());
    expect(mockSplit!.open).toBe(false);

    // the scrim, Escape and widening
    await click(channelButton()!);
    await run(() => mockSplit!.onClose());
    expect(mockSplit!.open).toBe(false);
  });

  it('closes the sheet when a row is picked, as there is one choice, and on a wide screen leaves the rail as it was', async () => {
    mockCollapse = '1';
    await mount();

    // the rail: picking changes the numbers and nothing else
    await run(() => mockPanel!.onChange('af'));
    expect(mockShown!.id).toBe('af');
    expect(mockSplit!.open).toBe(false);
    expect(mockSplit!.collapsed).toBe(true);
    expect(mockPanel!.collapsed).toBe(true);
    expect(mockSetCookie).not.toHaveBeenCalled();

    // the sheet
    await click(channelButton()!);
    expect(mockSplit!.open).toBe(true);
    await run(() => mockPanel!.onChange('bf'));
    expect(mockShown!.id).toBe('bf');
    expect(mockSplit!.open).toBe(false);
    expect(mockSetCookie).not.toHaveBeenCalled();
  });

  it('keeps a channel button reading channel_hint_analytics when no channel can be picked, so the sheet and its Reconnect still open', async () => {
    mockChannels = [
      channel('ln', 'linkedin', 'Moataz'),
      channel('dc', 'instagram', 'Gone Gram', { refreshNeeded: true }),
    ];
    await mount();

    const button = sheetButton()!;
    // it alone says to pick a channel there: the content's own line is the
    // wide screen's
    const lines = Array.from(row().children[0].querySelectorAll('*')).filter(
      (node) =>
        node.children.length === 0 &&
        node.textContent === 'tr:channel_hint_analytics'
    );
    expect(lines).toHaveLength(2);
    expect(
      lines.filter(
        (node) => !button.contains(node) && !withClass(node, 'mobile:hidden')
      )
    ).toEqual([]);
    expect(row().children[0].textContent).not.toContain(
      'tr:analytics_empty_title'
    );
    expect(classes(button)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
    // named by its text, with no channel to name
    expect(button.textContent).toBe('tr:channel_hint_analytics');
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    await click(button);
    expect(mockSplit!.open).toBe(true);
    expect(sheetButton()!.getAttribute('aria-expanded')).toBe('true');
    // the list there holds the disconnected channel, whose row has Reconnect
    expect(mockPanel!.channels).toEqual(mockChannels);
  });

  it('spans the period control across the width, and draws no picture strip', async () => {
    await mount();
    await run(() => mockPanel!.onChange('af'));

    expect(classes(periods())).toEqual(
      expect.arrayContaining(['mobile:w-full', 'mobile:ms-0'])
    );
    for (const radio of radios()) {
      expect(classes(radio)).toContain('mobile:flex-1');
    }
    // the only channel pictures are the chosen one's, in the bar and the button
    const pictures = Array.from(
      host.querySelectorAll('img[src^="https://cdn.example.com/"]')
    );
    expect(pictures.map((node) => node.getAttribute('src'))).toEqual([
      'https://cdn.example.com/af.png',
      'https://cdn.example.com/af.png',
    ]);
    // nothing scrolls sideways, and no picture fades
    expect(host.innerHTML).not.toMatch(/overflow-x-auto|opacity-20/);
  });
});

describe("the calendar's toast is gone (R4)", () => {
  it('sends no one to the calendar about a disconnected channel, which the list keeps to offer Reconnect', async () => {
    mockChannels[2] = { ...mockChannels[2], refreshNeeded: true };
    await mount();
    expect(mockShown!.id).toBe('af');
    expect(mockPanel!.channels).toContainEqual(mockChannels[2]);

    await run(() => mockPanel!.onChange('ig'));

    expect(mockShown!.id).toBe('af');
    expect(mockPanel!.selected).toBe('af');
    expect(mockShow).not.toHaveBeenCalled();
    expect(mockT.mock.calls.map(([key]) => key)).not.toContain(
      'please_refresh_the_integration_from_the_calendar'
    );
  });
});
