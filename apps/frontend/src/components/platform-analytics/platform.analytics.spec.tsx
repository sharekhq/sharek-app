import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What decides the page: the channel list SWR returns and the shared
// `collapseMenu` cookie. Each case sets them; beforeEach resets them.
let mockChannels: Array<Record<string, unknown>>;
let mockCollapse = '0';
const mockShow = jest.fn();
// Every chart the page asks for, by the channel it was handed.
const mockCharts: string[] = [];

jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: mockChannels, isLoading: false }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => [mockCollapse, jest.fn()],
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: mockShow }),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ disableXAnalytics: false }),
}));
// Marks every string as passed through the translator, so a case can tell a
// translated message from a hardcoded one.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => `tr:${key}`,
}));
// The charts are Sharek's and are not under test; only which channel they are
// drawn for is.
jest.mock(
  '@gitroom/frontend/components/platform-analytics/render.analytics',
  () => ({
    RenderAnalytics: ({ integration }: { integration: { id: string } }) => {
      mockCharts.push(integration.id);
      return <div data-chart={integration.id} />;
    },
  })
);

import { PlatformAnalytics } from '@gitroom/frontend/components/platform-analytics/platform.analytics';

const channel = (id: string, identifier: string, name: string) => ({
  id,
  identifier,
  name,
  picture: `https://cdn.example.com/${id}.png`,
  type: 'social',
  disabled: false,
});

const mounted: Root[] = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<PlatformAnalytics />);
  });
  return host;
};

// The avatar items, in the order they are drawn: the only elements with the
// row hover, which the collapse button does not carry.
const avatars = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).filter((node) =>
    node.className.split(/\s+/).includes('hover:bg-boxHover')
  );

const classes = (node: Element) => node.className.split(/\s+/);

const tap = async (node: Element) => {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // A switch unmounts the charts for one 10ms tick before drawing the new ones.
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
};

// The channel panel: the element the collapse cookie sizes.
const panel = (host: HTMLElement) =>
  host.querySelector('h2')!.parentElement!.parentElement!.parentElement!;

beforeEach(() => {
  mockChannels = [
    channel('fb', 'facebook', 'Sharek Page'),
    channel('ig', 'instagram', 'Sharek Gram'),
  ];
  mockCollapse = '0';
  mockShow.mockReset();
  mockCharts.splice(0);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('picking a channel from the avatars', () => {
  it('un-fades the tapped avatar, fades the other and draws its charts', async () => {
    const host = await render();
    const [first, second] = avatars(host);
    expect(classes(first)).not.toContain('opacity-20');
    expect(classes(second)).toContain('opacity-20');
    expect(mockCharts.at(-1)).toBe('fb');

    await tap(second);

    const [firstAfter, secondAfter] = avatars(host);
    expect(classes(firstAfter)).toContain('opacity-20');
    expect(classes(secondAfter)).not.toContain('opacity-20');
    expect(mockCharts.at(-1)).toBe('ig');
    expect(host.querySelector('[data-chart]')!.getAttribute('data-chart')).toBe(
      'ig'
    );
  });

  it('warns, translated, about a channel that needs a refresh and stays put', async () => {
    mockChannels[1] = { ...mockChannels[1], refreshNeeded: true };
    const host = await render();

    await tap(avatars(host)[1]);

    expect(mockShow).toHaveBeenCalledWith(
      'tr:please_refresh_the_integration_from_the_calendar',
      'warning'
    );
    expect(classes(avatars(host)[1])).toContain('opacity-20');
    expect(mockCharts.at(-1)).toBe('fb');
  });
});

describe('the channel strip up to 1025px', () => {
  it('stays full width with the collapse cookie set, its heading and names hidden', async () => {
    mockCollapse = '1';
    const host = await render();

    // Collapsed on a desktop it is the 100px rail; up to 1025px it is the row.
    expect(classes(panel(host))).toEqual(
      expect.arrayContaining(['sidebar', 'w-[100px]', 'mobile:w-full'])
    );
    expect(classes(host.querySelector('h2')!.parentElement!)).toContain(
      'mobile:hidden'
    );
    for (const name of ['Sharek Page', 'Sharek Gram']) {
      const label = Array.from(host.querySelectorAll('div')).find(
        (node) => node.textContent === name && node.children.length === 0
      )!;
      expect(classes(label)).toContain('mobile:hidden');
    }
  });

  it('stacks the page through its own wrapper, with nothing left at the phone screen', async () => {
    const host = await render();
    const wrapper = panel(host).parentElement!;

    expect(classes(wrapper)).toEqual(
      expect.arrayContaining(['min-w-0', 'mobile:flex-col'])
    );
    expect(panel(host).outerHTML).not.toMatch(/\bphone:/);
    expect(classes(wrapper.children[1])).toContain('mobile:p-[12px]');
  });

  it('lays the avatars in one sideways row, each a 44px tap box that keeps its place', async () => {
    const host = await render();
    const row = avatars(host)[0].parentElement!;

    // Scrolling sideways only: `overflow-x: auto` turns the other axis to
    // auto as well, and the 46px refresh overlay on a 36px avatar would then
    // let the strip wobble up and down under a finger.
    expect(classes(row)).toEqual(
      expect.arrayContaining([
        'mobile:flex-row',
        'mobile:overflow-x-auto',
        'mobile:overflow-y-hidden',
      ])
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
    }
  });
});

describe('with no channel to show', () => {
  it("shows Sharek's empty state", async () => {
    mockChannels = [];
    const host = await render();

    expect(host.textContent).toContain('tr:analytics_empty_title');
    expect(avatars(host)).toHaveLength(0);
  });
});
