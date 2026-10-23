import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

const mockShow = jest.fn();
const mockPush = jest.fn();
// What /integrations/list and /integrations/plug/list answer; each case sets it.
let mockIntegrations: Array<Record<string, unknown>> = [];
let mockPlugs: { plugs: Array<{ identifier: string; plugs: unknown[] }> } = {
  plugs: [],
};

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string) =>
    key === '/integrations/plug/list'
      ? { data: mockPlugs, isLoading: false }
      : { data: mockIntegrations, isLoading: false },
}));
// The cards are plug.tsx's (plug.spec.tsx); here a marker says which channel's
// plugs they were handed.
jest.mock('@gitroom/frontend/components/plugs/plug', () => {
  const { usePlugs } = jest.requireActual(
    '@gitroom/frontend/components/plugs/plugs.context'
  );
  return {
    Plug: () => <div data-plug-for={usePlugs()?.providerId} />,
  };
});
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));

import { Plugs } from '@gitroom/frontend/components/plugs/plugs';

const channel = (id: string, identifier: string, extra: object = {}) => ({
  id,
  identifier,
  name: `Channel ${id}`,
  picture: '',
  type: 'social',
  disabled: false,
  ...extra,
});

const mounted: Root[] = [];

const plugs = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Plugs />);
  });
  return host;
};

// A chip is the element around a channel's name: read it off the name, so the
// helper does not depend on the element a chip is drawn as.
// Found by its name, not its whole text: a channel that needs reconnecting
// carries a "!" badge inside its chip.
const names = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('*')).filter(
    (el) =>
      el.children.length === 0 && /^Channel \w+$/.test(el.textContent ?? '')
  );
const chips = (host: HTMLElement) =>
  names(host).map((name) => name.parentElement as HTMLElement);
const chip = (host: HTMLElement, id: string) =>
  names(host).find((name) => name.textContent === `Channel ${id}`)!
    .parentElement as HTMLElement;
const cardsFor = (host: HTMLElement) =>
  host.querySelector('[data-plug-for]')?.getAttribute('data-plug-for');

// Channels sort by type, then disabled, then identifier (plugs.tsx), so with one
// type 'bluesky' (b) comes before 'x' (a), and b is the channel Plugs opens on.
beforeEach(() => {
  mockIntegrations = [
    channel('a', 'x'),
    channel('b', 'bluesky'),
    channel('c', 'youtube'),
  ];
  mockPlugs = {
    plugs: [
      { identifier: 'x', plugs: [] },
      { identifier: 'bluesky', plugs: [] },
    ],
  };
  mockShow.mockClear();
  mockPush.mockClear();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the Plugs tab', () => {
  it('names itself, and lists only the channels that have plugs, as one wrapping row', async () => {
    const host = await plugs();

    expect(host.querySelector('h3')?.textContent).toBe('plugs');
    expect(chips(host).map((one) => one.textContent)).toEqual([
      'Channel b',
      'Channel a',
    ]);
    expect(chips(host)[0].parentElement!.className).toContain('flex flex-wrap');
  });

  it('opens on the first channel and hands its plugs to the cards', async () => {
    expect(cardsFor(await plugs())).toBe('b');
  });

  it('switches the cards to the channel picked', async () => {
    const host = await plugs();

    await act(async () => {
      chip(host, 'a').click();
    });

    expect(cardsFor(host)).toBe('a');
  });

  it('keeps the cards on the open channel when the one picked needs reconnecting, and says so in the interface language', async () => {
    mockIntegrations = [
      channel('a', 'x', { refreshNeeded: true }),
      channel('b', 'bluesky'),
    ];
    const host = await plugs();

    await act(async () => {
      chip(host, 'a').click();
    });

    expect(cardsFor(host)).toBe('b');
    expect(mockShow).toHaveBeenCalledWith(
      'please_refresh_the_integration_from_the_calendar',
      'warning'
    );
  });

  it("shows Sharek's empty state, which sends the user to connect a channel, when no channel has plugs", async () => {
    mockIntegrations = [channel('c', 'youtube')];
    const host = await plugs();

    expect(host.textContent).toContain('plugs_empty_title');
    expect(host.textContent).not.toContain(
      'there_are_not_plugs_matching_your_channels'
    );
    const action = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('connect_a_channel')
    )!;
    await act(async () => {
      action.click();
    });
    expect(mockPush).toHaveBeenCalledWith('/launches');
  });

  // The tab sits inside Settings: no channel drawer and no toggle that opens one.
  it('carries no channel drawer', async () => {
    const host = await plugs();

    expect(host.textContent).not.toContain('channels');
    expect(host.querySelector('[aria-expanded]')).toBeNull();
  });

  it('marks a channel that needs reconnecting in Sharek tokens', async () => {
    mockIntegrations = [
      channel('a', 'x', { refreshNeeded: true }),
      channel('b', 'bluesky'),
    ];
    const html = (await plugs()).innerHTML;

    expect(html).toContain('bg-error');
    expect(html).toContain(
      'bg-[color-mix(in_srgb,var(--color-primary)_60%,transparent)]'
    );
    expect(html).not.toMatch(/bg-red-\d|bg-primary\/\d/);
  });
});
