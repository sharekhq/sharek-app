import { act, ComponentProps, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// The calendar page (spec 051, pages-ui.md): the calendar column first, then
// the shared channel list at the end, in either direction, as its filter. The
// list is ChannelPanel in calendar mode inside SplitPanel, with the page's ⋯
// menu, drag to a customer and the customer rename; the rail's own Add
// Channel, Create Post, generator, build number and the phone row above the
// filters are gone, since the top bar and Settings hold them now. The
// composer gets the list in compareChannels order (C14), and a channel that is
// disabled while hidden shows again (C19).
//
// What is under test is the page's own wiring, so the panel, the sheet, the
// top bar, the grid and the ⋯ menu are markers that record what the page hands
// them. The calendar's state is a small provider that keeps the selection as
// the real one does. compareChannels is the real one. useT gives the key, so
// each case names the string it expects.
type Channel = ReturnType<typeof mockChannel>;

const mockVariables = { billingEnabled: true, showUpstreamExtras: false };
let mockUser: Record<string, unknown> = {};
const mockFetch = jest.fn(async () => ({ json: async () => ({}) }));
const mockMutate = jest.fn();
const mockToast = jest.fn();
const mockOpenModal = jest.fn();
const mockReconnect = jest.fn();
let mockCollapse = '0';
const mockSetCollapse = jest.fn();
// The list as GET /integrations/list gives it; a case reassigns it to refresh.
let mockChannels: Channel[] = [];
// Where the calendar's selection starts, and what the provider last had.
let mockStart: string[] | null = null;
let mockCalendar: {
  integrations: Channel[];
  selectedChannels: string[] | null;
};
// What the page last handed each marker.
let mockSplit: ComponentProps<typeof SplitPanel>;
let mockPanel: ComponentProps<typeof ChannelPanel> | undefined;
let mockFilters: {
  onOpenChannels?: () => void;
  channelsOpen?: boolean;
  update?: unknown;
};
const mockMenus = new Map<string, ComponentProps<typeof Menu>>();

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
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
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [mockCollapse, mockSetCollapse],
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  ...jest.requireActual('@gitroom/frontend/components/layout/new-modal'),
  useModals: () => ({ openModal: mockOpenModal }),
}));
// The calendar's state: the selection in state, provided with the list the
// page hands the provider, as CalendarWeekProvider does.
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => {
  const { createContext, useContext, useState } = jest.requireActual('react');
  const CalendarContext = createContext(undefined);
  return {
    CalendarContext,
    useCalendar: () => useContext(CalendarContext),
    CalendarWeekProvider: ({
      children,
      integrations,
    }: {
      children: ReactNode;
      integrations: Channel[];
    }) => {
      const [selectedChannels, setSelectedChannels] = useState(mockStart);
      mockCalendar = { integrations, selectedChannels };
      return (
        <CalendarContext.Provider
          value={{ integrations, selectedChannels, setSelectedChannels }}
        >
          {children}
        </CalendarContext.Provider>
      );
    },
  };
});
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplit = props;
    return <div data-testid="split-panel">{props.children}</div>;
  },
}));
// The panel renders each channel's ⋯ menu, so the page's rowMenu runs.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/channel.panel'),
  useReconnectChannel: () => mockReconnect,
  ChannelPanel: (props: ComponentProps<typeof ChannelPanel>) => {
    mockPanel = props;
    return (
      <div data-testid="channel-panel">
        {props.channels.map((channel) => (
          <i key={channel.id}>{props.rowMenu?.(channel)}</i>
        ))}
      </div>
    );
  },
}));
jest.mock('@gitroom/frontend/components/launches/filters', () => ({
  Filters: (props: typeof mockFilters) => {
    mockFilters = props;
    return <div data-testid="filters" />;
  },
}));
jest.mock('@gitroom/frontend/components/launches/calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));
jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: (props: ComponentProps<typeof Menu>) => {
    mockMenus.set(props.id, props);
    return <i data-testid="menu" />;
  },
}));
jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => <div data-testid="new-post" />,
}));
jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => <div data-testid="generator" />,
}));
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    AddProviderButton: () => <div data-testid="add-provider" />,
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);

// Everything below is scenery: the page has to mount. None of it is asserted
// on.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => () => undefined,
}));
jest.mock('react-dnd', () => ({
  useDrag: () => [{}, () => undefined, () => undefined],
  useDrop: () => [{}, () => undefined],
}));
jest.mock('@gitroom/frontend/components/launches/helpers/dnd.provider', () => ({
  DNDProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/launches/calendar.drag.layer', () => ({
  CalendarDragLayer: () => null,
}));
jest.mock('@gitroom/frontend/components/onboarding/onboarding', () => ({
  Onboarding: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock(
  '@gitroom/frontend/components/launches/no-channels.illustration',
  () => ({
    NoChannelsIllustration: () => null,
  })
);
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));

import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';
import {
  ChannelPanel,
  compareChannels,
} from '@gitroom/frontend/components/launches/channel.panel';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import { Menu } from '@gitroom/frontend/components/launches/menu/menu';

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals
// onto globalThis and that is not one of them, so a channel group's
// open/closed memory would throw during render.
globalThis.localStorage = window.localStorage;

function mockChannel(n: number, values: Record<string, unknown> = {}) {
  return {
    id: `int-${n}`,
    internalId: `internal-${n}`,
    identifier: 'mastodon',
    type: 'social',
    name: `Channel ${n}`,
    picture: `/avatar-${n}.png`,
    disabled: false,
    changeProfilePicture: false,
    changeNickName: false,
    customer: null as { id: string; name: string } | null,
    ...values,
  };
}

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
      root.render(<LaunchesComponent />);
    });
  };
  await render();
  return render;
};
const run = async (callback: () => unknown) => {
  await act(async () => {
    await callback();
  });
};
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const marker = (id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const count = (id: string) =>
  host.querySelectorAll(`[data-testid="${id}"]`).length;
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
// The row the panel sits in, and the calendar column beside it: the row's
// child that holds the grid.
const row = () => Array.from(marker('split-panel')!.parentElement!.children);
const column = () => row().find((child) => child.contains(marker('calendar')));
const ids = (list: Array<{ id: string }> | null | undefined) =>
  list?.map(({ id }) => id);
const sorted = (list: string[] | null | undefined) => list && [...list].sort();

const version = process.env.NEXT_PUBLIC_VERSION;

beforeEach(() => {
  mockVariables.billingEnabled = true;
  mockVariables.showUpstreamExtras = false;
  mockUser = { tier: { ai: true, current: 'pro' }, totalChannels: 10 };
  mockChannels = [mockChannel(1), mockChannel(2)];
  mockStart = null;
  mockCollapse = '0';
  mockPanel = undefined;
  mockFilters = {};
  mockMenus.clear();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  localStorage.clear();
  jest.clearAllMocks();
  if (version === undefined) delete process.env.NEXT_PUBLIC_VERSION;
  else process.env.NEXT_PUBLIC_VERSION = version;
});

describe('the layout (FR-001)', () => {
  it('puts the calendar column first and the channel list after it, so the list sits at the end in either direction', async () => {
    await mount();

    expect(column()).toBeDefined();
    expect(row().indexOf(column()!)).toBeLessThan(
      row().indexOf(marker('split-panel')!)
    );
    // the column holds the top bar, then the grid
    expect(column()!.contains(marker('filters'))).toBe(true);
    expect(
      marker('filters')!.compareDocumentPosition(marker('calendar')!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps the calendar column at 20px of padding, 12px on a phone, with a 600px floor there', async () => {
    await mount();

    expect(classes(column())).toEqual(
      expect.arrayContaining([
        'flex-1',
        'min-w-0',
        'p-[20px]',
        'mobile:p-[12px]',
        'mobile:min-h-[600px]',
      ])
    );
  });
});

describe('the channel list (C6, FR-005)', () => {
  it('is ChannelPanel in calendar mode, alone in a 288px SplitPanel named Channels, filtering the calendar', async () => {
    await mount();

    expect(marker('channel-panel')).not.toBeNull();
    expect(
      Array.from(marker('split-panel')!.children).map((el) =>
        el.getAttribute('data-testid')
      )
    ).toEqual(['channel-panel']);
    expect(mockSplit.label).toBe('channels');
    expect(mockSplit.width).toBe('w-[288px]');
    // the panel draws its own header (C6)
    expect(mockSplit).not.toHaveProperty('title');
    expect(mockSplit).not.toHaveProperty('onToggleCollapse');

    expect(mockPanel!.mode).toBe('calendar');
    expect(sorted(ids(mockPanel!.channels))).toEqual(['int-1', 'int-2']);
    expect(mockPanel!.selected).toBeNull();
    expect(typeof mockPanel!.update).toBe('function');

    // its ticks are the calendar's selection
    await run(() => mockPanel!.onChange(['int-1']));
    expect(mockCalendar.selectedChannels).toEqual(['int-1']);
    expect(mockPanel!.selected).toEqual(['int-1']);

    await run(() => mockPanel!.onChange(null));
    expect(mockCalendar.selectedChannels).toBeNull();
    expect(mockPanel!.selected).toBeNull();
  });

  it("gives each row the existing ⋯ menu, with today's props and the shared Reconnect", async () => {
    mockChannels = [
      mockChannel(1, { changeProfilePicture: true }),
      mockChannel(2, { disabled: true, changeNickName: true }),
    ];
    await mount();

    expect(typeof mockPanel?.rowMenu).toBe('function');
    expect(
      marker('channel-panel')!.querySelectorAll('[data-testid="menu"]')
    ).toHaveLength(2);
    expect(count('menu')).toBe(2);

    const enabled = mockMenus.get('int-1')!;
    const disabled = mockMenus.get('int-2')!;
    expect(enabled.refreshChannel).toBe(mockReconnect);
    expect(enabled.mutate).toBe(mockMutate);
    expect(enabled).toEqual(
      expect.objectContaining({
        canChangeProfilePicture: true,
        canChangeNickName: false,
        canEnable: false,
        canDisable: true,
      })
    );
    // under the plan's limit a disabled channel can be enabled again
    expect(disabled).toEqual(
      expect.objectContaining({
        canChangeProfilePicture: false,
        canChangeNickName: true,
        canEnable: true,
        canDisable: false,
      })
    );

    // a change from the menu reloads the list
    await run(() => enabled.onChange(false));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("can't enable a disabled channel from its menu once the plan is full", async () => {
    mockUser = { ...mockUser, totalChannels: 1 };
    mockChannels = [mockChannel(1), mockChannel(2, { disabled: true })];
    await mount();

    expect(typeof mockPanel?.rowMenu).toBe('function');
    expect(mockMenus.get('int-2')!.canEnable).toBe(false);
  });

  it('moves a dropped channel to a customer, or out of its customer onto the channels with none (C27)', async () => {
    mockChannels = [
      mockChannel(1),
      mockChannel(2, { customer: { id: 'c-1', name: 'Client 1' } }),
    ];
    await mount();

    expect(typeof mockPanel?.onMoveToCustomer).toBe('function');
    await run(() => mockPanel!.onMoveToCustomer!('int-1', 'c-2'));

    expect(mockFetch).toHaveBeenCalledWith('/integrations/int-1/group', {
      method: 'PUT',
      body: JSON.stringify({ group: 'c-2' }),
    });
    // moved at once, then reloaded once the server has it
    expect(mockMutate).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ id: 'int-1', customer: { id: 'c-2' } }),
      ]),
      false
    );
    expect(mockMutate).toHaveBeenLastCalledWith();

    await run(() => mockPanel!.onMoveToCustomer!('int-2', ''));
    expect(mockFetch).toHaveBeenLastCalledWith('/integrations/int-2/group', {
      method: 'PUT',
      body: JSON.stringify({ group: '' }),
    });
  });

  it("renames a customer through today's Edit group name modal", async () => {
    mockChannels = [
      mockChannel(1, { customer: { id: 'c-2', name: 'Client 2' } }),
    ];
    await mount();

    expect(typeof mockPanel?.onRenameCustomer).toBe('function');
    // not awaited: the rename waits on the modal
    await run(() => {
      mockPanel!.onRenameCustomer!({ id: 'c-2', name: 'Client 2' });
    });

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    const [{ title, children }] = mockOpenModal.mock.calls[0];
    expect(title).toBe('edit_group_name');
    const modal = children(jest.fn());
    expect(modal.props).toEqual(
      expect.objectContaining({ id: 'c-2', name: 'Client 2' })
    );

    // saved: the list reloads with the new name, and says so
    await run(() => modal.props.resolve('Client Two'));
    await flush();
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('group_updated', 'success');
  });

  it("opens as a sheet from the top bar's chip and closes from Done or the sheet", async () => {
    await mount();

    expect(typeof mockFilters.onOpenChannels).toBe('function');
    expect(typeof mockFilters.update).toBe('function');
    expect(mockFilters.channelsOpen).toBe(false);
    expect(mockSplit.open).toBe(false);

    await run(() => mockFilters.onOpenChannels!());
    expect(mockSplit.open).toBe(true);
    expect(mockFilters.channelsOpen).toBe(true);

    await run(() => mockPanel!.onDone());
    expect(mockSplit.open).toBe(false);
    expect(mockFilters.channelsOpen).toBe(false);

    // the scrim, Escape and widening close it through SplitPanel
    await run(() => mockFilters.onOpenChannels!());
    await run(() => mockSplit.onClose());
    expect(mockSplit.open).toBe(false);
  });

  it("collapses to the icon rail from the panel's own control, never as a sheet", async () => {
    mockCollapse = '1';
    await mount();

    expect(mockPanel?.collapsed).toBe(true);
    expect(mockSplit.collapsed).toBe(true);
    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCollapse).toHaveBeenLastCalledWith('0');

    await run(() => mockFilters.onOpenChannels!());
    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplit.collapsed).toBe(false);
  });

  it('expands again from the same control', async () => {
    await mount();

    expect(mockPanel?.collapsed).toBe(false);
    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCollapse).toHaveBeenLastCalledWith('1');
  });
});

describe('what the old rail held (FR-005, FR-015)', () => {
  it.each([
    ['with channels', [1, 2]],
    ['with no channels', []],
  ])(
    'leaves no Add Channel, Create Post, generator, tier or build number on the page, and no row above the top bar, %s',
    async (_, numbers) => {
      mockChannels = numbers.map((n) => mockChannel(n));
      mockVariables.showUpstreamExtras = true;
      mockUser = { ...mockUser, isLifetime: true };
      process.env.NEXT_PUBLIC_VERSION =
        '4b6c771f3a2e9d0c8b7a6f5e4d3c2b1a09f8e7d6';
      await mount();

      expect(count('add-provider')).toBe(0);
      expect(count('new-post')).toBe(0);
      expect(count('generator')).toBe(0);
      expect(host.textContent).not.toContain('4b6c771f3');
      expect(host.textContent).not.toContain('tier');
      // the top bar is the column's first row (FR-040)
      expect(column()!.firstElementChild!.contains(marker('filters'))).toBe(
        true
      );
    }
  );
});

describe('the list the calendar gets (C14)', () => {
  it('is the channel list sorted with compareChannels, so the composer lists channels as the panel does', async () => {
    const given = [
      mockChannel(10, { id: 'int-a', name: 'Channel 10' }),
      mockChannel(2, { id: 'int-b', name: 'Channel 2' }),
      mockChannel(2, { id: 'int-0', name: 'Channel 2' }),
      mockChannel(4, { id: 'int-d', type: 'article', identifier: 'devto' }),
      mockChannel(5, { id: 'int-e', identifier: 'bluesky', disabled: true }),
    ];
    mockChannels = given;
    await mount();

    const expected = ids([...given].sort(compareChannels));
    // the two tie-breaks change today's order
    expect(expected).toEqual(['int-0', 'int-b', 'int-a', 'int-e', 'int-d']);
    expect(ids(mockCalendar.integrations)).toEqual(expected);
  });
});

describe('a channel disabled while hidden (C19)', () => {
  it('shows again once a list refresh disables it, while the others stay as they were', async () => {
    mockChannels = [1, 2, 3, 4].map((n) => mockChannel(n));
    mockStart = ['int-1', 'int-3'];
    const render = await mount();
    expect(sorted(mockCalendar.selectedChannels)).toEqual(['int-1', 'int-3']);

    mockChannels = [
      mockChannel(1),
      mockChannel(2, { disabled: true }),
      mockChannel(3),
      mockChannel(4),
    ];
    await render();

    expect(sorted(mockCalendar.selectedChannels)).toEqual([
      'int-1',
      'int-2',
      'int-3',
    ]);
    expect(sorted(mockPanel?.selected)).toEqual(['int-1', 'int-2', 'int-3']);
  });

  it('leaves the calendar showing everything when nothing was hidden', async () => {
    const render = await mount();

    mockChannels = [mockChannel(1), mockChannel(2, { disabled: true })];
    await render();

    expect(mockCalendar.selectedChannels).toBeNull();
  });
});
