import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The Generate Posts trigger is inherited upstream UI — the sparkle tile beside New
// Post in the calendar's channels panel and, at 1025px and below, in the toolbar above
// the filters (spec 046), and the only way into the generator modal.
// Sharek hides it behind `showUpstreamExtras`, the default-off build-time flag that
// already hides the Chrome-extension icon, UGC and the Affiliate link (be378ddd), so
// nothing is deleted and SHOW_UPSTREAM_EXTRAS restores it.
//
// The gate is a condition in `LaunchesComponent`'s JSX, so the only thing that can
// see it is a render of that screen — hence the stubs below. The generator itself is
// replaced by a marker because what is under test is the call site deciding whether
// to mount it, not anything the generator does. New Post gets the same treatment and
// is asserted alongside it: it sits in the same row behind the same
// `sortedIntegrations` half of the condition, so a change that hid both — or that
// emptied the row for an unrelated reason — would otherwise read as a pass.
const variables = { billingEnabled: true, showUpstreamExtras: false };

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/launches/new.post', () => ({
  NewPost: () => <div data-testid="new-post" />,
}));
jest.mock('@gitroom/frontend/components/launches/generator/generator', () => ({
  GeneratorComponent: () => <div data-testid="generator" />,
}));

// Everything below is scenery: the screen has to mount for its channels panel to
// render. None of it is asserted on.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () => (_key: string, fallback?: string, values?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/{{(\w+)}}/g, (_, name) =>
        String(values?.[name])
      ),
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ tier: { ai: true }, totalChannels: 10 }),
}));
const mockChannel = (n: number) => ({
  id: `int-${n}`,
  internalId: `internal-${n}`,
  identifier: 'mastodon',
  name: `Channel ${n}`,
  picture: `/avatar-${n}.png`,
  disabled: false,
  changeProfilePicture: false,
  changeNickName: false,
});
let mockChannels = [mockChannel(1)];
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration.list', () => ({
  useIntegrationList: () => ({
    isLoading: false,
    data: mockChannels,
    mutate: () => undefined,
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['0', () => undefined],
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
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
jest.mock('@gitroom/frontend/components/launches/calendar.context', () => ({
  CalendarWeekProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/launches/calendar', () => ({
  Calendar: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/filters', () => ({
  Filters: () => null,
}));
jest.mock('@gitroom/frontend/components/onboarding/onboarding', () => ({
  Onboarding: () => null,
}));
// The panel shows whether it was asked to open, which is all the toolbar's chip does.
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  SplitPanel: ({ children, open }: { children: ReactNode; open: boolean }) => (
    <div data-testid="split-panel" data-open={String(open)}>
      {children}
    </div>
  ),
}));
jest.mock('@gitroom/frontend/components/launches/add.provider.component', () => ({
  AddProviderButton: () => <div data-testid="add-provider" />,
}));
jest.mock('@gitroom/frontend/components/launches/menu/menu', () => ({
  Menu: () => null,
}));
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => null,
}));
jest.mock('@gitroom/frontend/components/launches/no-channels.illustration', () => ({
  NoChannelsIllustration: () => null,
}));
jest.mock('@gitroom/react/helpers/safe.image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@gitroom/react/helpers/image.with.fallback', () => ({
  __esModule: true,
  default: ({ src, alt, className }: Record<string, string>) => (
    <i
      data-mock="ImageWithFallback"
      data-src={src}
      data-alt={alt}
      className={className}
    />
  ),
}));

import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';

// happy-dom has a localStorage; jest.setup.js lifts a fixed list of globals onto
// globalThis and that is not one of them, so the channel groups' open/closed memory
// would throw during render.
globalThis.localStorage = window.localStorage;

const channelsPanel = async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(<LaunchesComponent />);
  });
  return container;
};

const count = (container: HTMLElement, id: string) =>
  container.querySelectorAll(`[data-testid="${id}"]`).length;
const panel = (container: HTMLElement) =>
  container.querySelector('[data-testid="split-panel"]') as HTMLElement;
// The toolbar's channel chip, found by its name.
const chip = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('button')).find((b) =>
    (b.getAttribute('aria-label') ?? '').startsWith('Channels: ')
  );
const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/);

beforeEach(() => {
  mockChannels = [mockChannel(1)];
});

describe('the Generate Posts trigger', () => {
  beforeEach(() => {
    variables.showUpstreamExtras = false;
  });

  it('is not rendered while upstream extras are hidden, in the panel or the toolbar', async () => {
    const container = await channelsPanel();

    expect(count(container, 'generator')).toBe(0);
    // New Post sits in the panel and in the toolbar
    expect(count(container, 'new-post')).toBe(2);
  });

  it('comes back in both places when the flag is set, so nothing is deleted', async () => {
    variables.showUpstreamExtras = true;

    const container = await channelsPanel();

    expect(count(container, 'generator')).toBe(2);
  });
});

// At 1025px and below a toolbar above the filters holds a chip with the first
// three channels and the count, which opens the channel list as a sheet, and
// Create Post beside it, or Add Channel when there is no channel yet. The
// toolbar is `hidden mobile:flex`, so above 1025px it never shows.
describe('the small-screen toolbar', () => {
  beforeEach(() => {
    variables.showUpstreamExtras = false;
  });

  it('shows the first three channels and the count on a named chip', async () => {
    mockChannels = [1, 2, 3, 4, 5].map(mockChannel);
    const container = await channelsPanel();
    const button = chip(container);

    expect(button).toBeDefined();
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.getAttribute('aria-label')).toBe('Channels: 5');
    expect(button!.getAttribute('aria-expanded')).toBe('false');
    expect(classes(button)).toEqual(
      expect.arrayContaining([
        'h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
    const avatars = Array.from(
      button!.querySelectorAll('[data-mock="ImageWithFallback"]')
    );
    expect(avatars).toHaveLength(3);
    avatars.forEach((avatar) =>
      expect(avatar.getAttribute('data-alt')).toBe('')
    );
    // overlapped from the start edge, which is the right in Arabic
    expect(classes(avatars[0])).not.toContain('-ms-[10px]');
    expect(classes(avatars[1])).toContain('-ms-[10px]');
    expect(classes(avatars[2])).toContain('-ms-[10px]');
    expect(button!.textContent).toBe('5');
    expect(classes(button!.parentElement)).toEqual(
      expect.arrayContaining(['hidden', 'mobile:flex'])
    );
  });

  it('puts Create Post beside the chip', async () => {
    const container = await channelsPanel();
    expect(chip(container)).toBeDefined();
    const toolbar = chip(container)!.parentElement!;

    expect(count(toolbar, 'new-post')).toBe(1);
    expect(count(toolbar, 'add-provider')).toBe(0);
  });

  it('opens the channel sheet from the chip', async () => {
    const container = await channelsPanel();
    expect(panel(container).getAttribute('data-open')).toBe('false');
    expect(chip(container)).toBeDefined();

    await act(async () => {
      chip(container)!.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(panel(container).getAttribute('data-open')).toBe('true');
    expect(chip(container)!.getAttribute('aria-expanded')).toBe('true');
  });

  it('offers Add Channel instead of Create Post with no channel yet', async () => {
    mockChannels = [];
    const container = await channelsPanel();
    expect(chip(container)).toBeDefined();
    const toolbar = chip(container)!.parentElement!;

    expect(chip(container)!.textContent).toBe('Channels');
    expect(count(toolbar, 'add-provider')).toBe(1);
    expect(count(toolbar, 'new-post')).toBe(0);
  });

  it("leaves the panel's Create Post row and version line to above 1025px", async () => {
    const container = await channelsPanel();
    const panelPost = panel(container).querySelector(
      '[data-testid="new-post"]'
    );
    const version = Array.from(panel(container).querySelectorAll('div')).find(
      (div) => classes(div).includes('mt-[5px]')
    );

    expect(classes(panelPost!.parentElement)).toContain('mobile:hidden');
    expect(classes(version)).toContain('mobile:hidden');
  });

  it('gives the calendar column 12px of padding and a 600px floor', async () => {
    const container = await channelsPanel();
    const column = Array.from(container.querySelectorAll('div')).find(
      (div) =>
        classes(div).includes('min-w-0') && classes(div).includes('p-[20px]')
    );

    expect(classes(column)).toEqual(
      expect.arrayContaining(['mobile:p-[12px]', 'mobile:min-h-[600px]'])
    );
  });
});
