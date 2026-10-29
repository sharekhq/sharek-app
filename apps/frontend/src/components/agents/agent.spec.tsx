import { act, useContext } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What decides the page: the channels and chats SWR returns and the shared
// `collapseMenu` cookie. Each case sets them; beforeEach resets them.
let mockChannels: Array<Record<string, unknown>>;
let mockThreads: Array<{ id: string; title: string }>;
let mockCollapse = '0';

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) => ({
    data: key === 'integrations' ? mockChannels : { threads: mockThreads },
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'chat-1' }),
  usePathname: () => '/agents/chat-1',
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [mockCollapse, jest.fn()],
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
// The attachments toolbar is MediaPortal's, which this page does not draw.
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  MultiMediaComponent: () => null,
}));

import {
  Agent,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';

const channel = (id: string, identifier: string, name: string) => ({
  id,
  identifier,
  name,
  picture: `https://cdn.example.com/${id}.png`,
  type: 'social',
  disabled: false,
});

// Stands in for the chat: reads the selection Samy will be handed.
const Probe = () => {
  const { properties } = useContext(PropertiesContext);
  return (
    <div
      data-probe=""
      data-selected={(properties as Array<{ id: string }>)
        .map((p) => p.id)
        .join(',')}
    />
  );
};

const mounted: Root[] = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <Agent>
        <Probe />
      </Agent>
    );
  });
  return host;
};

const classes = (node: Element) => node.className.split(/\s+/);

const tap = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

// The avatar items: the only elements with the row hover.
const avatars = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).filter((node) =>
    classes(node).includes('hover:bg-boxHover')
  );

const probe = (host: HTMLElement) => host.querySelector('[data-probe]')!;

// The channels rail: heading → header row → scroller → rail.
const channelsRail = (host: HTMLElement) =>
  host.querySelector('h2')!.parentElement!.parentElement!.parentElement!;

const newChat = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('a')).find(
    (a) => a.textContent === 'Start a new chat'
  )!;

// The chats rail: link → its wrapper → scroller → rail.
const chatsRail = (host: HTMLElement) =>
  newChat(host).parentElement!.parentElement!.parentElement!;

const chips = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('a')).filter((a) =>
    a.getAttribute('href')!.startsWith('/agents/')
  );

beforeEach(() => {
  mockChannels = [
    channel('fb', 'facebook', 'Sharek Page'),
    channel('ig', 'instagram', 'Sharek Gram'),
  ];
  mockThreads = [
    { id: 'chat-1', title: 'Plan the launch week' },
    { id: 'chat-2', title: 'A very long title that will not fit a chip' },
  ];
  mockCollapse = '0';
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('picking the channels Samy acts on', () => {
  it('adds a tapped avatar to the selection and un-fades it, and takes it out again', async () => {
    const host = await render();
    expect(avatars(host).every((a) => classes(a).includes('opacity-20'))).toBe(
      true
    );

    await tap(avatars(host)[1]);
    expect(probe(host).getAttribute('data-selected')).toBe('ig');
    expect(classes(avatars(host)[1])).not.toContain('opacity-20');
    expect(classes(avatars(host)[0])).toContain('opacity-20');

    await tap(avatars(host)[1]);
    expect(probe(host).getAttribute('data-selected')).toBe('');
    expect(classes(avatars(host)[1])).toContain('opacity-20');
  });
});

describe('Samy up to 1025px', () => {
  it('draws no drawer: no off-canvas panel, no Channels or Chats button, no scrim', async () => {
    const host = await render();

    expect(host.innerHTML).not.toMatch(/phone:fixed|phone:translate-x/);
    const buttons = Array.from(host.querySelectorAll('button')).map(
      (b) => b.textContent
    );
    expect(buttons).not.toContain('Channels');
    expect(buttons).not.toContain('Chats');
    expect(host.querySelector('[aria-hidden="true"].fixed')).toBeNull();
  });

  it('gives the chat exactly what the strips leave, with no floor', async () => {
    const host = await render();
    const chat = probe(host).parentElement!;

    expect(classes(chat)).toEqual(
      expect.arrayContaining(['flex-1', 'min-w-0', 'mobile:min-h-0'])
    );
    expect(host.innerHTML).not.toMatch(/min-h-\[500px\]/);
  });

  it('stacks channels, then chats, then the chat, in one column', async () => {
    const host = await render();
    const wrapper = channelsRail(host).parentElement!;

    expect(classes(wrapper)).toEqual(
      expect.arrayContaining(['min-w-0', 'mobile:flex-col'])
    );
    expect(classes(channelsRail(host))).toContain('mobile:order-1');
    expect(classes(chatsRail(host))).toContain('mobile:order-2');
    expect(classes(probe(host).parentElement!)).toContain('mobile:order-3');
    expect(Array.from(wrapper.children)).toEqual([
      channelsRail(host),
      probe(host).parentElement,
      chatsRail(host),
    ]);
  });

  it("draws Start a new chat as Sharek's 44px brand button, and 44px chips that end in an ellipsis", async () => {
    const host = await render();

    expect(classes(newChat(host))).toEqual(
      expect.arrayContaining([
        'bg-brand',
        'rounded-[8px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
        'min-h-[44px]',
      ])
    );
    expect(chips(host)).toHaveLength(2);
    for (const chip of chips(host)) {
      // Outlines are off app-wide, so a chip shows keyboard focus as a ring.
      expect(classes(chip)).toEqual(
        expect.arrayContaining([
          'coarse:min-h-[44px]',
          'mobile:max-w-[180px]',
          'focus-visible:ring-2',
          'focus-visible:ring-brand',
        ])
      );
      // A `coarse:flex` box drops text-overflow on its own text, so the title
      // carries the ellipsis.
      const title = chip.querySelector('span')!;
      expect(classes(title)).toContain('truncate');
      expect(title.textContent).toBe(
        mockThreads.find(
          (t) => chip.getAttribute('href') === `/agents/${t.id}`
        )!.title
      );
    }
  });

  it('keeps the channel strip full width with the collapse cookie set, its heading and names hidden', async () => {
    mockCollapse = '1';
    const host = await render();

    expect(classes(channelsRail(host))).toEqual(
      expect.arrayContaining(['sidebar', 'w-[100px]', 'mobile:w-full'])
    );
    expect(classes(host.querySelector('h2')!.parentElement!)).toContain(
      'mobile:hidden'
    );
    for (const avatar of avatars(host)) {
      expect(classes(avatar)).toEqual(
        expect.arrayContaining([
          'coarse:min-h-[44px]',
          'coarse:min-w-[44px]',
          'mobile:shrink-0',
          'mobile:coarse:-m-[4px]',
        ])
      );
      expect(classes(avatar.lastElementChild!)).toContain('mobile:hidden');
    }
  });
});
