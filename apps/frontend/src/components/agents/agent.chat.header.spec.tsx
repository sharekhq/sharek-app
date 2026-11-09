import { act, FC, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SWRConfig } from 'swr';
import * as fs from 'fs';
import * as path from 'path';
import i18next from 'i18next';

// Samy's chat header and the message box's "Samy will use" line (spec 051,
// R15, R16, contracts/pages-ui.md's Samy part). The header names the open
// chat, found in the chats list by CopilotKit's thread id, and writes that id
// to Agent's context for the chats panel (C21). Its ⋯ renames and pins through
// the history's own field and calls (C22), a reply that ends refreshes the
// list (R14), and at 1025px and below it's option A's one bar: Chats, the
// title, ⋯ and New chat. The summary says which channels Samy will use and
// opens the channel list (FR-026).
//
// SWR runs for real on a cache of its own, and only the requests are stubbed.
// useT runs on i18next with the real en and ar files, so each case reads the
// words a user sees, the plural counts included. The test DOM has no layout
// and no media queries, so sizes and widths are pinned by the classes that
// carry them. The last case renders AgentChat on agent.chat.language.spec's
// scenery, whose stubs are among these.
type Chat = { id: string; title: string; pinned: boolean; updatedAt: string };
type Channel = {
  id: string;
  name: string;
  picture: string;
  identifier: string;
  customer?: { id: string; name: string } | null;
};

const mockFetch = jest.fn();
const mockToast = jest.fn();
// the open chat's id, as CopilotKit holds it
let mockThreadId = '';
// the wiring case's stand-in for the header; every other case has the real one
let mockHeader: FC | null = null;

jest.mock('@copilotkit/react-core', () => ({
  useCopilotContext: () => ({ threadId: mockThreadId }),
  // AgentChat's: the provider renders its children, so what's inside it is
  // reached
  CopilotKit: ({ children }: { children: ReactNode }) => children,
  useCopilotAction: () => {},
  useCopilotChatInternal: () => ({
    messages: [],
    setMessages: () => {},
    isAvailable: true,
  }),
}));
jest.mock('@copilotkit/react-ui', () => ({ CopilotChat: () => null }));
jest.mock('@gitroom/frontend/components/agents/agent.input', () => ({
  Input: () => null,
}));
jest.mock('@gitroom/frontend/components/agents/agent', () => ({
  PropertiesContext: jest
    .requireActual('react')
    .createContext({ properties: [] }),
}));
jest.mock('@gitroom/frontend/components/agents/agent.attachments', () => ({
  AttachmentsProvider: ({ children }: { children: ReactNode }) => children,
  AttachmentsTray: () => null,
  AttachmentTools: () => null,
  AttachmentsDropOverlay: () => null,
  PlayBadge: () => null,
  useAttachments: () => ({
    tiles: [],
    attached: [],
    uploading: false,
    addFiles: () => {},
    addMedia: () => {},
    remove: () => {},
    clear: () => {},
  }),
}));
jest.mock('@gitroom/frontend/components/layout/drop.files', () => ({
  DropFiles: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: '' }),
}));
jest.mock('@gitroom/frontend/components/new-launch/add.edit.modal', () => ({
  AddEditModal: () => null,
}));
// The address of a chat started from New chat keeps the word `new` (C21).
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'new' }) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mockFetch,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockToast }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, defaultValue?: string, values?: Record<string, unknown>) =>
      mockT(key, defaultValue, values),
}));
jest.mock('@gitroom/frontend/components/agents/agent.chat.header', () => {
  const actual = jest.requireActual(
    '@gitroom/frontend/components/agents/agent.chat.header'
  );
  return {
    ...actual,
    ChatHeader: () => {
      const Header = mockHeader || actual.ChatHeader;
      return <Header />;
    },
  };
});

import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import {
  ChatRunContext,
  useChatRun,
} from '@gitroom/frontend/components/agents/agent.created.media';
import {
  ChannelSummary,
  ChatHeader,
} from '@gitroom/frontend/components/agents/agent.chat.header';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';

const mockT = (
  key: string,
  defaultValue?: string,
  values?: Record<string, unknown>
) => i18next.t(key, { defaultValue, ...values });

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

const chat = (id: string, title: string, pinned = false): Chat => ({
  id,
  title,
  pinned,
  updatedAt: '2026-11-08T15:00:00.000Z',
});

// As GET /copilot/list answers, last used first.
const LIST: Chat[] = [
  chat('cold-brew', 'Cold brew launch plan', true),
  chat('noor', 'Weekly posts for Noor Dental'),
  chat('offers', 'عروض نهاية الأسبوع'),
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

// Agent's context, as T069's page gives it
const setThreadId = jest.fn();
const openChats = jest.fn();
const openChannels = jest.fn();

// What the page around the header holds: whether a reply is running, whether
// the chats panel is hidden on a wide screen, and Samy's picks.
type Scene = {
  running?: boolean;
  chatsHidden?: boolean;
  properties?: Channel[];
};

let cache: Map<string, unknown>;
const mounted: Root[] = [];

// The clock is fake, so a case moves it to see what the header does later.
const settle = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const tree = (
  ui: ReactNode,
  { running = false, chatsHidden = false, properties = [] }: Scene
) => (
  <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
    <PropertiesContext.Provider
      value={{
        properties,
        threadId: '',
        setThreadId,
        chatsHidden,
        hideChats: () => undefined,
        closeChats: () => undefined,
        openChats,
        openChannels,
      }}
    >
      <ChatRunContext.Provider value={{ running, setRunning: () => undefined }}>
        {ui}
      </ChatRunContext.Provider>
    </PropertiesContext.Provider>
  </SWRConfig>
);

// Renders `ui` in the scene, and gives a way to change the scene after.
const render = async (ui: ReactNode, scene: Scene = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  const update = async (next: Scene) => {
    await act(async () => {
      root.render(tree(ui, next));
    });
    await settle();
  };
  await update(scene);
  return { host, update };
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

const bar = (host: HTMLElement) => host.firstElementChild!;
const heading = (host: HTMLElement) => host.querySelector('h2');
// the element that holds the title, in its own direction
const titleOf = (host: HTMLElement) =>
  heading(host)!.querySelector('[dir="auto"]')!;
const options = (host: HTMLElement) =>
  host.querySelector('[aria-label="Chat options"]');
const menuItems = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[role="menuitem"]'));
const choose = async (host: HTMLElement, label: string) => {
  await tap(options(host)!);
  await tap(menuItems(host).find((item) => item.textContent === label)!);
};
const field = (host: HTMLElement) =>
  host.querySelector<HTMLInputElement>('input');
const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!;
// /agents, as the history's New chat: a route of its own, so the chat being
// left unmounts and a new one starts at /agents/new (agent.chats.spec.tsx)
const newChat = (host: HTMLElement) =>
  host.querySelector<HTMLAnchorElement>('a[href="/agents"]')!;
// how many times the list was read
const lists = () =>
  mockFetch.mock.calls.filter(([url]) => url === '/copilot/list').length;
// the requests other than the list's
const puts = () =>
  mockFetch.mock.calls
    .filter(([url]) => url !== '/copilot/list')
    .map(([url, options]) => [
      url,
      options.method,
      JSON.parse(options.body as string),
    ]);

const rename = async (host: HTMLElement, text: string) => {
  await choose(host, 'Rename');
  await type(field(host)!, text);
};

beforeEach(() => {
  jest.useFakeTimers();
  cache = new Map();
  mockThreadId = 'noor';
  mockHeader = null;
  mockList = LIST;
  mockPut = async () => answer(200);
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) =>
    url === '/copilot/list'
      ? Promise.resolve(answer(200, { threads: mockList }))
      : mockPut()
  );
  mockToast.mockReset();
  setThreadId.mockReset();
  openChats.mockReset();
  openChannels.mockReset();
});

afterEach(async () => {
  for (const root of mounted.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
  jest.useRealTimers();
  await i18next.changeLanguage('en');
});

describe("the chat's title", () => {
  it('is the open chat’s, found in the list by the id CopilotKit holds', async () => {
    const { host } = await render(<ChatHeader />);

    expect(mockFetch).toHaveBeenCalledWith('/copilot/list');
    expect(heading(host)!.textContent).toBe('Weekly posts for Noor Dental');
    expect(classes(heading(host)!)).toEqual(
      expect.arrayContaining(['text-[15px]', 'font-[600]', 'min-w-0'])
    );
  });

  it('keeps its own direction and is cut at its own end', async () => {
    mockThreadId = 'offers';
    const { host } = await render(<ChatHeader />);

    expect(titleOf(host).textContent).toBe('عروض نهاية الأسبوع');
    expect(classes(titleOf(host))).toContain('truncate');
  });

  it("writes that id to Agent's context, and the next one when it changes (C21)", async () => {
    const { host, update } = await render(<ChatHeader />);
    expect(setThreadId).toHaveBeenLastCalledWith('noor');

    mockThreadId = 'cold-brew';
    await update({});

    expect(setThreadId).toHaveBeenLastCalledWith('cold-brew');
    expect(heading(host)!.textContent).toBe('Cold brew launch plan');
  });

  it('reads New chat with no ⋯ before the first reply, at /agents/new too', async () => {
    mockThreadId = 'fresh';
    const { host } = await render(<ChatHeader />);

    expect(setThreadId).toHaveBeenLastCalledWith('fresh');
    expect(heading(host)!.textContent).toBe('New chat');
    expect(options(host)).toBeNull();
  });
});

describe('the ⋯ Chat options', () => {
  it('offers Rename and Pin to top, or Unpin on a pinned chat', async () => {
    const { host, update } = await render(<ChatHeader />);

    expect(options(host)!.getAttribute('aria-haspopup')).toBe('menu');
    await tap(options(host)!);
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'Rename',
      'Pin to top',
    ]);
    await press(document.body, 'Escape');

    mockThreadId = 'cold-brew';
    await update({});
    await tap(options(host)!);
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'Rename',
      'Unpin',
    ]);
  });

  it("turns the title into the history's field, from the title it has", async () => {
    const { host } = await render(<ChatHeader />);

    await choose(host, 'Rename');
    const input = field(host)!;

    expect(input.value).toBe('Weekly posts for Noor Dental');
    expect(input.getAttribute('aria-label')).toBe('Rename');
    expect(input.getAttribute('dir')).toBe('auto');
    expect(document.activeElement).toBe(input);
    expect(heading(host)).toBeNull();
    expect(options(host)).toBeNull();
  });

  it('saves the trimmed title on Enter, in the header and the list at once', async () => {
    const saving = deferred();
    mockPut = () => saving.promise;
    const { host } = await render(<ChatHeader />);

    await rename(host, '  Noor: weekly posts  ');
    await press(field(host)!, 'Enter');

    expect(puts()).toEqual([
      ['/copilot/noor/title', 'PUT', { title: 'Noor: weekly posts' }],
    ]);
    expect(field(host)).toBeNull();
    // before the server answers
    expect(heading(host)!.textContent).toBe('Noor: weekly posts');
    expect(
      (cache.get('threads') as { data: { threads: Chat[] } }).data.threads[1]
        .title
    ).toBe('Noor: weekly posts');

    saving.resolve(answer(200));
    await settle();
    expect(heading(host)!.textContent).toBe('Noor: weekly posts');
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('cancels on Escape, which goes no further than the field', async () => {
    const { host } = await render(<ChatHeader />);
    const heard = jest.fn();
    document.addEventListener('keydown', heard);

    await rename(host, 'Something else');
    await press(field(host)!, 'Escape');
    document.removeEventListener('keydown', heard);

    expect(puts()).toEqual([]);
    expect(field(host)).toBeNull();
    expect(heading(host)!.textContent).toBe('Weekly posts for Noor Dental');
    expect(heard).not.toHaveBeenCalled();
  });

  it('sends nothing for an empty name, and keeps the title', async () => {
    const { host } = await render(<ChatHeader />);

    await rename(host, '   ');
    await press(field(host)!, 'Enter');

    expect(puts()).toEqual([]);
    expect(heading(host)!.textContent).toBe('Weekly posts for Noor Dental');
  });

  it('shows error_occurred on a failed save, and puts the title back', async () => {
    mockPut = async () => answer(500);
    const { host } = await render(<ChatHeader />);

    await rename(host, 'Noor: weekly posts');
    await press(field(host)!, 'Enter');

    expect(mockToast).toHaveBeenCalledWith(
      'An error occurred. Please try again.',
      'warning'
    );
    expect(heading(host)!.textContent).toBe('Weekly posts for Noor Dental');
  });

  it('pins the chat, which then offers Unpin', async () => {
    const { host } = await render(<ChatHeader />);

    await choose(host, 'Pin to top');

    expect(puts()).toEqual([['/copilot/noor/pin', 'PUT', { pinned: true }]]);
    await tap(options(host)!);
    expect(menuItems(host).map((item) => item.textContent)).toEqual([
      'Rename',
      'Unpin',
    ]);
  });
});

describe('when a reply ends', () => {
  it('reloads the list, so a new chat shows the title it was given', async () => {
    mockThreadId = 'fresh';
    const { host, update } = await render(<ChatHeader />, { running: true });
    expect(lists()).toBe(1);

    mockList = [chat('fresh', 'Spring menu'), ...LIST];
    await update({ running: false });

    expect(lists()).toBe(2);
    expect(heading(host)!.textContent).toBe('Spring menu');
    expect(options(host)).not.toBeNull();
  });

  it("doesn't reload it while a reply starts or nothing ends", async () => {
    const { update } = await render(<ChatHeader />);

    await update({ running: false, chatsHidden: true });
    expect(lists()).toBe(1);

    await update({ running: true });
    expect(lists()).toBe(1);

    await update({ running: false });
    expect(lists()).toBe(2);
    // a chat with a title is read once
    await settle(10_000);
    expect(lists()).toBe(2);
  });

  // Mastra may save a new chat's generated title just after its first reply
  // ends, so the list read then can still have it untitled, or not at all.
  it('reads it again every 1.5s while the chat is still untitled, until its title lands', async () => {
    mockThreadId = 'fresh';
    const { host, update } = await render(<ChatHeader />, { running: true });

    await update({ running: false });
    expect(lists()).toBe(2);
    await settle(1499);
    expect(lists()).toBe(2);

    mockList = [chat('fresh', ''), ...LIST];
    await settle(1);
    expect(lists()).toBe(3);
    expect(heading(host)!.textContent).toBe('New chat');

    mockList = [chat('fresh', 'Spring menu'), ...LIST];
    await settle(1500);
    expect(lists()).toBe(4);
    expect(heading(host)!.textContent).toBe('Spring menu');

    await settle(10_000);
    expect(lists()).toBe(4);
  });

  it('stops after three more reads', async () => {
    mockThreadId = 'fresh';
    const { update } = await render(<ChatHeader />, { running: true });

    await update({ running: false });
    await settle(4500);
    expect(lists()).toBe(5);

    await settle(10_000);
    expect(lists()).toBe(5);
  });

  it('stops when another chat opens or the next reply starts', async () => {
    mockThreadId = 'fresh';
    const { update } = await render(<ChatHeader />, { running: true });

    await update({ running: false });
    expect(lists()).toBe(2);
    mockThreadId = 'other';
    await update({ running: false });
    await settle(10_000);
    expect(lists()).toBe(2);

    await update({ running: true });
    await update({ running: false });
    expect(lists()).toBe(3);
    await update({ running: true });
    await settle(10_000);
    expect(lists()).toBe(3);
  });

  // The list answers after the chat changed or the next reply started: the
  // chat it was read for is still untitled, and isn't read for again.
  it('stops a read still in flight when another chat opens or the next reply starts', async () => {
    mockThreadId = 'fresh';
    const { update } = await render(<ChatHeader />, { running: true });
    const leaving = deferred();
    mockFetch.mockImplementationOnce(() => leaving.promise);

    await update({ running: false });
    expect(lists()).toBe(2);
    mockThreadId = 'other';
    await update({ running: false });
    leaving.resolve(answer(200, { threads: mockList }));
    await settle(10_000);
    expect(lists()).toBe(2);

    const replying = deferred();
    mockFetch.mockImplementationOnce(() => replying.promise);
    await update({ running: true });
    await update({ running: false });
    expect(lists()).toBe(3);
    await update({ running: true });
    replying.resolve(answer(200, { threads: mockList }));
    await settle(10_000);
    expect(lists()).toBe(3);
  });
});

describe('the bar', () => {
  it('holds Chats, the title, ⋯ and New chat in one row, with no sideways strip', async () => {
    const { host } = await render(<ChatHeader />);
    const row = bar(host);

    expect(Array.from(row.children)).toEqual([
      button(host, 'Show chats'),
      heading(host),
      options(host),
      newChat(host),
    ]);
    expect(classes(row)).toEqual(
      expect.arrayContaining([
        'flex',
        'items-center',
        'h-[56px]',
        'mobile:h-[52px]',
        'border-b',
        'border-line',
      ])
    );
    expect(host.querySelector('[class*="overflow-x"]')).toBeNull();
  });

  it('gives the title the room between them at 1025px and below', async () => {
    const { host } = await render(<ChatHeader />);

    expect(classes(heading(host)!)).toContain('mobile:flex-1');
  });

  it('shows Chats at 1025px and below, 44px, opening the chats drawer', async () => {
    const { host } = await render(<ChatHeader />);
    const chats = button(host, 'Show chats');

    expect(chats.textContent).toBe('Chats');
    expect(chats.querySelector('svg')).not.toBeNull();
    expect(classes(chats)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex', 'mobile:h-[44px]'])
    );

    await tap(chats);
    expect(openChats).toHaveBeenCalledTimes(1);
  });

  it('shows Show chats at its start on a wide screen while the chats panel is hidden', async () => {
    const { host } = await render(<ChatHeader />, { chatsHidden: true });
    const chats = button(host, 'Show chats');

    expect(bar(host).firstElementChild).toBe(chats);
    expect(classes(chats)).toContain('flex');
    expect(classes(chats)).not.toContain('hidden');

    await tap(chats);
    expect(openChats).toHaveBeenCalledTimes(1);
  });

  it('makes ⋯ 44px at 1025px and below and on touch screens', async () => {
    const { host } = await render(<ChatHeader />);

    expect(classes(options(host)!)).toEqual(
      expect.arrayContaining([
        'w-[28px]',
        'h-[28px]',
        'mobile:w-[44px]',
        'mobile:h-[44px]',
        'coarse:w-[44px]',
        'coarse:h-[44px]',
      ])
    );
  });

  it('starts a new chat with a + at 1025px and below, 44px', async () => {
    const { host } = await render(<ChatHeader />);
    const link = newChat(host);

    expect(link.getAttribute('aria-label')).toBe('New chat');
    expect(link.textContent).toBe('');
    expect(link.querySelector('svg')).not.toBeNull();
    expect(classes(link)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex', 'w-[44px]', 'h-[44px]'])
    );
  });
});

const BAYT = { id: 'bayt', name: 'Bayt Al Qahwa' };
const NOOR = { id: 'noor-dental', name: 'Noor Dental' };
const channel = (
  id: string,
  customer: Channel['customer'] = null
): Channel => ({
  id,
  name: `${id} channel`,
  picture: `/avatar-${id}.png`,
  identifier: 'instagram',
  customer,
});

const summary = (host: HTMLElement) => host.querySelector('button')!;

describe('ChannelSummary', () => {
  it("reads Samy will use with the customer's name when every pick is that customer's", async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT), channel('b', BAYT), channel('c', BAYT)],
    });
    const line = summary(host);

    expect(line.getAttribute('type')).toBe('button');
    expect(line.textContent).toContain('Samy will use');
    expect(line.querySelector('bdi')!.textContent).toBe('Bayt Al Qahwa');
    expect(line.textContent).toContain('· 3 channels');
    expect(line.getAttribute('aria-label')).toBe(
      'Samy will use Bayt Al Qahwa, 3 channels. Change channels'
    );
  });

  it('names the first channel when the picks span customers, or some have none', async () => {
    const { host, update } = await render(<ChannelSummary />, {
      properties: [channel('a', NOOR), channel('b', BAYT)],
    });
    expect(summary(host).querySelector('bdi')!.textContent).toBe('a channel');

    await update({ properties: [channel('c', BAYT), channel('d')] });
    expect(summary(host).querySelector('bdi')!.textContent).toBe('c channel');

    await update({ properties: [channel('e')] });
    expect(summary(host).getAttribute('aria-label')).toBe(
      'Samy will use e channel, 1 channel. Change channels'
    );
  });

  // A 390px phone left the name a few letters ("Ba…"), and so did the chat
  // from 1026px to about 1100px with both side panels open, so below 1280px
  // the line drops it and keeps the words and the count; the label says it all
  // (Look T074, M16, and the re-Look).
  it('leaves the name out below 1280px, and to its label', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT), channel('b', BAYT), channel('c', BAYT)],
    });
    const line = summary(host);
    const name = line.querySelector('bdi')!;

    expect(classes(name)).toContain('[@media(max-width:1279px)]:hidden');
    // shown on a wide screen
    expect(classes(name)).not.toContain('hidden');
    // the only words that drop; the arrow is decoration, with its own case
    expect(line.querySelectorAll('[class*="hidden"]:not(svg)')).toHaveLength(1);
    expect(line.textContent).toBe('Samy will useBayt Al Qahwa· 3 channels');
    expect(line.getAttribute('aria-label')).toBe(
      'Samy will use Bayt Al Qahwa, 3 channels. Change channels'
    );
  });

  // With the name hidden, two text nodes side by side are one flex item, so
  // the words ran into the count, "Samy will use· 3 channels" (Look T074,
  // M18). The count is an element of its own, as the board has it, so the
  // pill's gap stays between them whether or not the name shows.
  it('keeps the count a part of its own, the gap from the words with the name hidden', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT), channel('b', BAYT), channel('c', BAYT)],
    });
    const line = summary(host);
    const shown = Array.from(line.childNodes).filter(
      (node) => node.nodeName !== 'BDI'
    );

    expect(classes(line)).toEqual(
      expect.arrayContaining(['flex', 'gap-[8px]'])
    );
    expect(shown.map((node) => [node.nodeName, node.textContent])).toEqual([
      ['SPAN', ''],
      ['#text', 'Samy will use'],
      ['SPAN', '· 3 channels'],
      ['svg', ''],
    ]);
  });

  // The down arrow promises something opens. At 1025px and below choosing the
  // pill opens the channel sheet; on a wide screen it only moves the focus to
  // the list beside it, so the arrow shows on the narrow side alone (walk 4,
  // maintainer).
  it('shows its down arrow only at 1025px and below, where it opens the channel sheet', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT)],
    });
    const arrow = summary(host).querySelector('svg')!;

    expect(arrow.getAttribute('aria-hidden')).toBe('true');
    expect(classes(arrow)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:block'])
    );
  });

  it('shows the first three pictures, as decoration', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: ['a', 'b', 'c', 'd'].map((id) => channel(id, BAYT)),
    });
    const pictures = Array.from(summary(host).querySelectorAll('img'));

    expect(pictures.map((picture) => picture.getAttribute('src'))).toEqual([
      '/avatar-a.png',
      '/avatar-b.png',
      '/avatar-c.png',
    ]);
    expect(pictures[0].parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(summary(host).textContent).toContain('· 4 channels');
  });

  it("counts in each language's plural forms", async () => {
    await i18next.changeLanguage('ar');
    const { host, update } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT), channel('b', BAYT)],
    });
    expect(summary(host).getAttribute('aria-label')).toBe(
      'سيستخدم سامي Bayt Al Qahwa، قناتان. تغيير القنوات'
    );

    await update({
      properties: ['a', 'b', 'c'].map((id) => channel(id, BAYT)),
    });
    expect(summary(host).textContent).toContain('· 3 قنوات');

    await update({
      properties: Array.from({ length: 11 }, (_, n) => channel(`${n}`, BAYT)),
    });
    expect(summary(host).textContent).toContain('· 11 قناة');
  });

  it('leaves a name as it is, since React escapes it', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', { id: 'rawda', name: 'Rawda & Co' })],
    });

    expect(summary(host).getAttribute('aria-label')).toBe(
      'Samy will use Rawda & Co, 1 channel. Change channels'
    );
  });

  it('reads No channels picked with none', async () => {
    const { host } = await render(<ChannelSummary />);
    const line = summary(host);

    expect(line.textContent).toBe('No channels picked');
    expect(line.querySelector('img')).toBeNull();
  });

  it('opens the channel list when chosen', async () => {
    const { host } = await render(<ChannelSummary />, {
      properties: [channel('a', BAYT)],
    });

    await tap(summary(host));
    expect(openChannels).toHaveBeenCalledTimes(1);
  });
});

// C23: useChatRun() falls back to a run that never starts outside
// ChatRunProvider, so a header placed there would never see a reply end.
describe('in AgentChat', () => {
  it('sits inside ChatRunProvider, so it sees the run it starts', async () => {
    let run: ReturnType<typeof useChatRun> | undefined;
    const StandIn: FC = () => {
      run = useChatRun();
      return null;
    };
    mockHeader = StandIn;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<AgentChat />);
    });

    expect(run).toBeDefined();
    await act(async () => {
      run!.setRunning(true);
    });
    expect(run!.running).toBe(true);
  });
});
