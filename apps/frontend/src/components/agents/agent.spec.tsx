import { act, ComponentProps, useContext, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Samy's page (spec 051, pages-ui.md): the chats panel at the start, the chat,
// then the shared channel list in samy mode at the end, in either direction.
// At 1025px and below the chats open as SplitPanel's start-side drawer and
// the channel list as its bottom sheet, so the two sideways strips are gone.
// The page reads the channels only through the shared useIntegrationList,
// keeps the picked ids and hands Samy the list's usable channels among them
// (C20). Its context carries what the chats panel, the chat header and the
// "Samy will use" summary need: the openers, whether the chats are hidden,
// Hide chats and Close, and the open chat's id (C21).
//
// What is under test is the page's own wiring, so the chats panel, the
// channel panel and SplitPanel are markers that record what the page hands
// them; the chats panel reads the context as the real one does (T053). The
// chat route is a probe that reads and calls the context, as the header and
// the summary inside AgentChat do (T068, T070). isUsable is the real one.
// useT gives the key, so each case names the string it expects.
type Channel = ReturnType<typeof integration>;
type Page = {
  properties: Channel[];
  threadId: string;
  setThreadId: (id: string) => void;
  chatsHidden: boolean;
  openChats: () => void;
  openChannels: () => void;
  hideChats: () => void;
  closeChats: () => void;
};

// The list as GET /integrations/list gives it; a case reassigns it to refresh.
let mockChannels: Channel[] = [];
const mockMutate = jest.fn();
let mockParams = { id: 'chat-1' };
// The collapseMenu cookie the three pages share, and what was written to it.
let mockCollapse = '0';
const mockSetCookie = jest.fn();
// The keys of anything the page loads itself.
const mockKeys: unknown[] = [];
// What the page last handed each marker, and the context the chats panel read.
let mockSplits: Partial<
  Record<'chats' | 'channels', ComponentProps<typeof SplitPanel>>
>;
let mockPanel: ComponentProps<typeof ChannelPanel> | undefined;
let mockChats: Page | undefined;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
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
    return { data: undefined, mutate: () => undefined };
  },
}));
jest.mock('next/navigation', () => ({
  useParams: () => mockParams,
  usePathname: () => `/agents/${mockParams.id}`,
  useRouter: () => ({ push: () => undefined }),
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
// The chats panel takes the drawer, the channel list the sheet.
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplits[props.variant === 'drawer' ? 'chats' : 'channels'] = props;
    return (
      <div data-testid="split-panel" data-variant={props.variant}>
        {props.children}
      </div>
    );
  },
}));
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/launches/channel.panel'),
  ChannelPanel: (props: ComponentProps<typeof ChannelPanel>) => {
    mockPanel = props;
    return (
      <div data-testid="channel-panel">
        <button type="button">channel</button>
      </div>
    );
  },
}));
jest.mock('@gitroom/frontend/components/agents/agent.chats', () => ({
  ChatsPanel: () => {
    // read at render: this page's module is still loading when this runs
    const { useContext } = jest.requireActual('react');
    const { PropertiesContext } = jest.requireActual(
      '@gitroom/frontend/components/agents/agent'
    );
    mockChats = useContext(PropertiesContext);
    return (
      <div data-testid="chats-panel" data-thread={mockChats!.threadId}>
        <button type="button">chat</button>
      </div>
    );
  },
}));
// Scenery: the channel panel's module loads for isUsable.
jest.mock(
  '@gitroom/frontend/components/launches/add.provider.component',
  () => ({
    useAddProvider: () => () => undefined,
    CustomVariables: () => null,
  })
);
// Scenery: the brand chip's module, whose hook makes the brand choice, loads
// the message box's attachments for its note.
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({}));

import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import {
  Agent,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import {
  ChannelPanel,
  isUsable,
} from '@gitroom/frontend/components/launches/channel.panel';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';

function integration(id: string, values: Record<string, unknown> = {}) {
  return {
    id,
    internalId: `internal-${id}`,
    identifier: 'facebook',
    type: 'social',
    name: `Channel ${id}`,
    picture: `https://cdn.example.com/${id}.png`,
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    customer: null as { id: string; name: string } | null,
    additionalSettings: '[]',
    time: [{ time: 120 }],
    ...values,
  };
}

// The window, as the media query reports it: wider than 1025px unless a case
// narrows it, and what listens for it to change (split.panel.spec.tsx's stub).
const realMatchMedia = window.matchMedia;
let smallWindow = false;
const listeners = new Set<() => void>();

const resize = async (small: boolean) => {
  smallWindow = small;
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
};

// Stands in for the chat route: the context it reads, kept once each render
// commits, and the chat it is.
let page: Page;
const Probe = ({ chat }: { chat: string }) => {
  const context = useContext(PropertiesContext) as unknown as Page;
  useEffect(() => {
    page = context;
  });
  return <div data-testid="chat" data-chat={chat} />;
};

const mounted: Root[] = [];
let host: HTMLElement;

// The page in a host, and a way to render it again on a chat, as a list
// refresh or a chat switch does: the layout stays and the route changes.
const mount = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const render = async (chat = 'chat-1') => {
    mockParams = { id: chat };
    await act(async () => {
      root.render(
        <Agent>
          <Probe key={chat} chat={chat} />
        </Agent>
      );
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
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const marker = (id: string) =>
  host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);
// The SplitPanel a marker sits in, the chat's column and the row they share.
const splitOf = (id: string) =>
  marker(id)?.closest('[data-testid="split-panel"]') ?? null;
const column = () => marker('chat')!.parentElement!;
const row = () => column().parentElement!;
// The row's children in order: the chat, the panel each SplitPanel holds, or
// the classes of anything else.
const layout = () =>
  Array.from(row().children).map((child) =>
    child === column()
      ? 'chat'
      : child.getAttribute('data-testid') === 'split-panel'
      ? child
          .querySelector('[data-testid$="-panel"]')
          ?.getAttribute('data-testid')
      : child.className
  );
// Whether the focus is in the panel a marker sits in.
const focusedIn = (id: string) =>
  document.activeElement !== document.body &&
  !!splitOf(id)?.contains(document.activeElement);
// What Samy gets, which the summary counts, and what the panel ticks by its
// own rule, so the three can be compared.
const sent = () => page.properties.map(({ id }) => id).sort();
const ticks = () =>
  mockPanel!.channels
    .filter(
      (channel) =>
        isUsable(channel, 'samy') && mockPanel!.selected!.includes(channel.id)
    )
    .map(({ id }) => id)
    .sort();

beforeEach(() => {
  mockChannels = [
    integration('fb'),
    integration('ig', { identifier: 'instagram' }),
  ];
  mockParams = { id: 'chat-1' };
  mockCollapse = '0';
  mockKeys.length = 0;
  mockSplits = {};
  mockPanel = undefined;
  mockChats = undefined;
  smallWindow = false;
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  unmountAll();
  window.matchMedia = realMatchMedia;
  jest.clearAllMocks();
});

describe('the layout (FR-001, FR-020)', () => {
  it('puts the chats panel first, then the chat, then the channel list, so the history sits at the start and the list at the end in either direction', async () => {
    await mount();

    expect(layout()).toEqual(['chats-panel', 'chat', 'channel-panel']);
  });

  it('gives the chat what the panels leave, in one column at 1025px and below, with no floor', async () => {
    await mount();

    expect(classes(row())).toEqual(
      expect.arrayContaining(['min-w-0', 'mobile:flex-col'])
    );
    expect(classes(column())).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', 'mobile:min-h-0'])
    );
    expect(host.innerHTML).not.toMatch(/min-h-\[500px\]/);
  });
});

describe('the chats panel (FR-020, R15)', () => {
  it('sits in a 272px SplitPanel named Chats that opens as the start-side drawer', async () => {
    await mount();

    expect(splitOf('chats-panel')?.getAttribute('data-variant')).toBe('drawer');
    expect(mockSplits.chats).toEqual(
      expect.objectContaining({
        variant: 'drawer',
        label: 'chats',
        width: 'w-[272px]',
        open: false,
      })
    );
    // it hides whole, never as a rail of pictures
    expect(mockSplits.chats!.collapsed).toBeFalsy();
  });

  it("hides for the visit from the panel's Hide chats, and the context says so", async () => {
    await mount();
    expect(page.chatsHidden).toBe(false);

    await run(() => mockChats!.hideChats());
    expect(marker('chats-panel')).toBeNull();
    expect(page.chatsHidden).toBe(true);
    // the chat and the channel list stay
    expect(marker('chat')).not.toBeNull();
    expect(marker('channel-panel')).not.toBeNull();

    // no cookie: the next visit shows the chats again
    expect(mockSetCookie).not.toHaveBeenCalled();
    unmountAll();
    await mount();
    expect(marker('chats-panel')).not.toBeNull();
    expect(page.chatsHidden).toBe(false);
  });

  it("holds the open chat's id, which the chat header writes and the chats panel marks (C21)", async () => {
    await mount();

    await run(() => page.setThreadId('chat-9'));
    expect(page.threadId).toBe('chat-9');
    expect(marker('chats-panel')!.getAttribute('data-thread')).toBe('chat-9');
  });
});

describe('the channel list (FR-025, C6)', () => {
  it('is ChannelPanel in samy mode on the shared list, in a 288px SplitPanel named Channels, with nothing picked yet', async () => {
    await mount();

    expect(mockSplits.channels).toEqual(
      expect.objectContaining({
        label: 'channels',
        width: 'w-[288px]',
        open: false,
        collapsed: false,
      })
    );
    expect(mockPanel).toEqual(
      expect.objectContaining({ mode: 'samy', selected: [], collapsed: false })
    );
    expect(mockPanel!.channels).toEqual(mockChannels);
    // the calendar's ⋯ menu, drag and customer rename stay the calendar's
    expect(mockPanel!.rowMenu).toBeUndefined();
    expect(mockPanel!.onMoveToCustomer).toBeUndefined();
    expect(mockPanel!.onRenameCustomer).toBeUndefined();

    // Add Channel, Invite and Reconnect refresh the shared list
    await run(() => mockPanel!.update());
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("collapses to the icon rail and back from the panel's own control, on the shared collapseMenu cookie", async () => {
    mockCollapse = '1';
    await mount();
    expect(mockPanel?.collapsed).toBe(true);
    expect(mockSplits.channels?.collapsed).toBe(true);

    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCookie).toHaveBeenLastCalledWith('collapseMenu', '0');
    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplits.channels!.collapsed).toBe(false);

    await run(() => mockPanel!.onToggleCollapse());
    expect(mockSetCookie).toHaveBeenLastCalledWith('collapseMenu', '1');
    expect(mockPanel!.collapsed).toBe(true);
  });
});

describe('the strips are gone (FR-008, FR-041, C10)', () => {
  it('reads the channels only through useIntegrationList, loads nothing itself but the brands, and draws neither strip', async () => {
    await mount();

    // the list comes from the shared hook, the chats from the chats panel,
    // and the brands, which the brand chip chooses among, from useBrands
    // (spec 053)
    expect(new Set(mockKeys)).toEqual(new Set(['/brands']));
    expect(
      Object.keys(
        jest.requireActual('@gitroom/frontend/components/agents/agent')
      )
    ).not.toContain('AgentList');
    expect(host.textContent).not.toMatch(/select_channels|start_a_new_chat/);
    // nothing scrolls sideways, and no picture fades
    expect(host.innerHTML).not.toMatch(/overflow-x-auto|opacity-20/);
  });
});

describe('what Samy gets (C20, FR-025)', () => {
  it('is the picked channels as the integration objects, unchanged, and an unpicked one drops out', async () => {
    await mount();
    expect(page.properties).toEqual([]);

    await run(() => mockPanel!.onChange(['ig']));
    expect(page.properties).toEqual([mockChannels[1]]);
    expect(mockPanel!.selected).toEqual(['ig']);

    await run(() => mockPanel!.onChange(['fb', 'ig']));
    expect(sent()).toEqual(['fb', 'ig']);

    await run(() => mockPanel!.onChange(['fb']));
    expect(sent()).toEqual(['fb']);
    expect(mockPanel!.selected).toEqual(['fb']);

    await run(() => mockPanel!.onChange([]));
    expect(page.properties).toEqual([]);
    expect(mockPanel!.selected).toEqual([]);
  });

  it('keeps the picks through a chat switch', async () => {
    const render = await mount();
    await run(() => mockPanel!.onChange(['fb']));

    await render('chat-2');

    expect(marker('chat')!.getAttribute('data-chat')).toBe('chat-2');
    expect(sent()).toEqual(['fb']);
    expect(mockPanel!.selected).toEqual(['fb']);
  });

  it.each([
    ['disconnected', { refreshNeeded: true }],
    ['as needing setup', { inBetweenSteps: true }],
    ['disabled', { disabled: true }],
  ])(
    "drops a pick the list then reports %s from what Samy gets, the summary and the panel's ticks",
    async (_, state) => {
      const render = await mount();
      await run(() => mockPanel!.onChange(['fb', 'ig']));
      expect(sent()).toEqual(['fb', 'ig']);

      mockChannels = [
        integration('fb', state),
        integration('ig', { identifier: 'instagram' }),
      ];
      await render();

      // the summary counts what is sent
      expect(sent()).toEqual(['ig']);
      // the panel has the list as it is now, and ticks what is sent
      expect(mockPanel!.channels).toEqual(mockChannels);
      expect(ticks()).toEqual(['ig']);
    }
  );
});

describe('the openers at 1025px and below (FR-041, FR-043)', () => {
  beforeEach(() => {
    smallWindow = true;
  });

  it("open the chats drawer, which the panel's Close and SplitPanel close", async () => {
    await mount();
    expect(mockSplits.chats?.open).toBe(false);

    await run(() => page.openChats());
    expect(mockSplits.chats!.open).toBe(true);
    expect(mockSplits.channels!.open).toBe(false);

    // Close, picking a chat and New chat (T053)
    await run(() => mockChats!.closeChats());
    expect(mockSplits.chats!.open).toBe(false);

    // the scrim, Escape and widening
    await run(() => page.openChats());
    await run(() => mockSplits.chats!.onClose());
    expect(mockSplits.chats!.open).toBe(false);
  });

  it('open the channel sheet, never as the icon rail, which Done and SplitPanel close', async () => {
    mockCollapse = '1';
    await mount();
    expect(mockSplits.channels?.open).toBe(false);

    await run(() => page.openChannels());
    expect(mockSplits.channels!.open).toBe(true);
    expect(mockSplits.chats!.open).toBe(false);
    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplits.channels!.collapsed).toBe(false);
    // the rail stays as it was for a wide screen
    expect(mockSetCookie).not.toHaveBeenCalled();

    await run(() => mockPanel!.onDone());
    expect(mockSplits.channels!.open).toBe(false);

    await run(() => page.openChannels());
    await run(() => mockSplits.channels!.onClose());
    expect(mockSplits.channels!.open).toBe(false);
  });

  it('open the drawer with the chats in it after Hide chats on a wide screen', async () => {
    smallWindow = false;
    await mount();
    await run(() => mockChats!.hideChats());
    expect(marker('chats-panel')).toBeNull();

    await resize(true);
    await run(() => page.openChats());

    expect(mockSplits.chats!.open).toBe(true);
    expect(splitOf('chats-panel')?.getAttribute('data-variant')).toBe('drawer');
  });
});

describe('the openers on a wide screen (FR-026, R16)', () => {
  it('expand the collapsed channel rail, as its own Expand does, and put the focus in it, opening no sheet', async () => {
    mockCollapse = '1';
    await mount();

    await run(() => page.openChannels());
    await settle();

    expect(mockSetCookie).toHaveBeenLastCalledWith('collapseMenu', '0');
    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplits.channels!.collapsed).toBe(false);
    expect(mockSplits.channels!.open).toBe(false);
    expect(focusedIn('channel-panel')).toBe(true);
  });

  it('put the focus in the channel rail when it is already expanded, opening no sheet', async () => {
    await mount();

    await run(() => page.openChannels());
    await settle();

    expect(mockPanel!.collapsed).toBe(false);
    expect(mockSplits.channels!.open).toBe(false);
    expect(focusedIn('channel-panel')).toBe(true);
  });

  it('show the hidden chats panel again and put the focus in it, opening no drawer', async () => {
    await mount();
    await run(() => mockChats!.hideChats());
    expect(marker('chats-panel')).toBeNull();

    await run(() => page.openChats());
    await settle();

    expect(marker('chats-panel')).not.toBeNull();
    expect(page.chatsHidden).toBe(false);
    expect(mockSplits.chats!.open).toBe(false);
    expect(focusedIn('chats-panel')).toBe(true);
  });
});
