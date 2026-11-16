import { act, ComponentProps, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What decides the list: the plan and role on the user, the two server flags
// and the address. Each case sets them; beforeEach resets them.
const mockVariables = {
  isGeneral: true,
  showThirdParty: false,
};
let mockUser: {
  role: string;
  tier: Record<string, string | boolean>;
};
let mockParams = new URLSearchParams();
const mockAsked: string[] = [];
// What the page last handed the menu.
let mockMenu: ComponentProps<typeof SettingsMenu> | undefined;

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
}));
// Records every key asked for, so a case can say a key was or was never used,
// and fills the default's placeholders from the values passed.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT:
    () =>
    (key: string, fallback?: string, params?: Record<string, unknown>) => {
      mockAsked.push(key);
      return (fallback ?? key).replace(/{{(\w+)}}/g, (whole, name) =>
        params && name in params ? String(params[name]) : whole
      );
    },
}));

// Each panel is a marker: what is under test is which tab the list offers and
// which panel it opens, not what a panel draws.
jest.mock('@gitroom/frontend/components/settings/global.settings', () => ({
  GlobalSettings: () => <div data-panel="global_settings" />,
}));
jest.mock('@gitroom/frontend/components/settings/teams.component', () => ({
  TeamsComponent: () => <div data-panel="teams" />,
}));
jest.mock('@gitroom/frontend/components/webhooks/webhooks', () => ({
  Webhooks: () => <div data-panel="webhooks" />,
}));
jest.mock('@gitroom/frontend/components/autopost/autopost', () => ({
  Autopost: () => <div data-panel="autopost" />,
}));
jest.mock('@gitroom/frontend/components/sets/sets', () => ({
  Sets: () => <div data-panel="sets" />,
}));
jest.mock('@gitroom/frontend/components/settings/signatures.component', () => ({
  SignaturesComponent: () => <div data-panel="signatures" />,
}));
jest.mock('@gitroom/frontend/components/public-api/public.component', () => ({
  PublicComponent: () => <div data-panel="api" />,
}));
jest.mock(
  '@gitroom/frontend/components/third-parties/third-party.component',
  () => ({
    ThirdPartyComponent: () => <div data-panel="integrations" />,
  })
);
jest.mock('@gitroom/frontend/components/plugs/plugs', () => ({
  Plugs: () => <div data-panel="plugs" />,
}));
jest.mock('@gitroom/frontend/components/settings/apps.component', () => ({
  AppsComponent: ({ canManageApps }: { canManageApps: boolean }) => (
    <div data-panel="apps" data-can-manage-apps={String(canManageApps)} />
  ),
}));

// The menu is SettingsMenu itself, recording what the page hands it; how it
// draws the tabs, the strip and its foot is settings.menu.spec's. Its rail is
// a marker, its ring is the channel list's, whose module loads the
// calendar's, and its Log out row's confirmation is logout.component.spec's.
jest.mock('@gitroom/frontend/components/settings/settings.menu', () => {
  const actual = jest.requireActual<
    typeof import('@gitroom/frontend/components/settings/settings.menu')
  >('@gitroom/frontend/components/settings/settings.menu');
  return {
    SettingsMenu: (props: ComponentProps<typeof actual.SettingsMenu>) => {
      mockMenu = props;
      return <actual.SettingsMenu {...props} />;
    },
  };
});
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/ui/split.panel'),
  SplitPanel: ({ children }: { children: ReactNode }) => (
    <aside data-split-panel="">{children}</aside>
  ),
}));
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  FOCUS_RING: 'focus-visible:ring-2 focus-visible:ring-brand',
}));
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => <div data-logout />,
  useLogout: () => () => undefined,
}));

// Scenery: the profile form and the modal stack the component wires up. None
// of it is asserted on.
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: () => undefined, openModal: () => undefined }),
}));
jest.mock('@gitroom/frontend/components/media/media.component', () => ({
  showMediaBox: () => undefined,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => ({}) }),
}));
jest.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: () => undefined,
}));
jest.mock('@gitroom/nestjs-libraries/dtos/users/user.details.dto', () => ({
  UserDetailDto: class {},
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

import { SettingsPopup } from '@gitroom/frontend/components/layout/settings.component';
import type { SettingsMenu } from '@gitroom/frontend/components/settings/settings.menu';

// An admin on a paid plan that offers every tab.
const admin = () => ({
  role: 'ADMIN',
  tier: {
    current: 'PRO',
    team_members: true,
    webhooks: true,
    autoPost: true,
    public_api: true,
  },
});

const mounted: Root[] = [];

const settings = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<SettingsPopup />);
  });
  return host;
};

// The tabs as drawn: each a button that says whether it is open (Log out says
// nothing), in the order the menu draws them.
const tabs = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('button[aria-pressed]'));
const labels = (host: HTMLElement) => tabs(host).map((tab) => tab.textContent);
const selected = (host: HTMLElement) =>
  tabs(host)
    .filter((tab) => tab.getAttribute('aria-pressed') === 'true')
    .map((tab) => tab.textContent);
const panel = (host: HTMLElement) =>
  host.querySelector('[data-panel]')?.getAttribute('data-panel');

// The window is wider than 1025px, where the menu is a rail.
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  mockUser = admin();
  mockVariables.isGeneral = true;
  mockVariables.showThirdParty = false;
  mockParams = new URLSearchParams();
  mockAsked.length = 0;
  mockMenu = undefined;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
});

// Which tabs the page offers; the order they show in is the menu's
// (settings.menu.spec).
describe('the Settings tabs', () => {
  it('offers an admin on a paid plan every tab but Integrations', async () => {
    expect(labels(await settings()).sort()).toEqual(
      [
        'Global Settings',
        'Teams',
        'Webhooks',
        'Auto Post',
        'Sets',
        'Signatures',
        'Developers',
        'Plugs',
        'Apps',
      ].sort()
    );
  });

  it('shows Integrations only when third-party integrations are switched on', async () => {
    expect(labels(await settings())).not.toContain('Integrations');

    mockVariables.showThirdParty = true;
    expect(labels(await settings())).toContain('Integrations');
  });

  it('keeps the Developers name, and never asks for an Agents / Dev label', async () => {
    const host = await settings();

    expect(labels(host)).not.toContain('Agents / Dev');
    expect(labels(host)).not.toContain('Agents');
    expect(mockAsked).toContain('developers');
    expect(mockAsked).not.toContain('agents_dev');
    expect(mockAsked).not.toContain('agents');
  });

  it('hides Teams from the User role and gives it approved apps only', async () => {
    mockUser = { ...admin(), role: 'USER' };
    mockParams = new URLSearchParams('tab=apps');
    const host = await settings();

    expect(labels(host)).not.toContain('Teams');
    expect(labels(host)).toContain('Plugs');
    expect(
      host
        .querySelector('[data-panel="apps"]')
        ?.getAttribute('data-can-manage-apps')
    ).toBe('false');
  });

  it('offers Developers only with API access, and then Apps shows approved apps only', async () => {
    mockUser = { ...admin(), tier: { ...admin().tier, public_api: false } };
    mockParams = new URLSearchParams('tab=apps');
    const host = await settings();

    expect(labels(host)).not.toContain('Developers');
    expect(
      host
        .querySelector('[data-panel="apps"]')
        ?.getAttribute('data-can-manage-apps')
    ).toBe('false');
  });

  it('lets an admin with API access manage OAuth apps under Apps', async () => {
    mockParams = new URLSearchParams('tab=apps');

    expect(
      (await settings())
        .querySelector('[data-panel="apps"]')
        ?.getAttribute('data-can-manage-apps')
    ).toBe('true');
  });

  it('offers Plugs and Apps on the free plan, where the paid tabs are gone', async () => {
    mockUser = {
      role: 'ADMIN',
      tier: { current: 'FREE', public_api: false },
    };

    expect(labels(await settings())).toEqual([
      'Global Settings',
      'Plugs',
      'Apps',
    ]);
  });
});

describe('a Settings address that names a tab', () => {
  it('opens that tab', async () => {
    mockParams = new URLSearchParams('tab=plugs');
    const host = await settings();

    expect(panel(host)).toBe('plugs');
    expect(selected(host)).toEqual(['Plugs']);
  });

  it('opens Developers by the key it has always had', async () => {
    mockParams = new URLSearchParams('tab=api');

    expect(panel(await settings())).toBe('api');
  });

  it('opens the first tab when it names a tab the user does not have', async () => {
    mockUser = { ...admin(), role: 'USER' };
    mockParams = new URLSearchParams('tab=teams');
    const host = await settings();

    expect(panel(host)).toBe('global_settings');
    expect(selected(host)).toEqual(['Global Settings']);
  });

  it('opens the first tab for a name no tab has', async () => {
    mockParams = new URLSearchParams('tab=agents');

    expect(panel(await settings())).toBe('global_settings');
  });
});

// The old Integrations address lands here (see the old addresses spec): with
// the switch off it must reveal nothing, neither the tab nor its panel.
describe('the Integrations address with third-party integrations switched off', () => {
  it('opens the first tab and reveals no Integrations tab or panel', async () => {
    mockParams = new URLSearchParams('tab=integrations');
    const host = await settings();

    expect(panel(host)).toBe('global_settings');
    expect(labels(host)).not.toContain('Integrations');
    expect(host.querySelector('[data-panel="integrations"]')).toBeNull();
  });

  it('opens Integrations once the switch is on', async () => {
    mockVariables.showThirdParty = true;
    mockParams = new URLSearchParams('tab=integrations');

    expect(panel(await settings())).toBe('integrations');
  });
});

// The menu is SettingsMenu (spec 059, US5, research R5): the page hands it the
// tabs it offers, the open one, what to do on a change and whether Log out
// shows. Above 1025px it is a SplitPanel rail beside the open tab's scroll box
// and outside it, so the menu holds still while a long tab scrolls.
describe("the page's menu", () => {
  it('is SettingsMenu, handed the tabs, the open one, a change handler and Log out', async () => {
    mockParams = new URLSearchParams('tab=plugs');
    await settings();

    expect(mockMenu?.list).toHaveLength(9);
    expect(mockMenu?.list).toContainEqual({ tab: 'api', label: 'Developers' });
    expect(mockMenu?.tab).toBe('plugs');
    expect(mockMenu?.onChange).toBeInstanceOf(Function);
    expect(mockMenu?.showLogout).toBe(true);
  });

  it('hides Log out during onboarding on a paid plan', async () => {
    mockParams = new URLSearchParams('onboarding=true');
    await settings();

    expect(mockMenu?.showLogout).toBe(false);
  });

  it('sits in a SplitPanel above 1025px, beside the scroll box and not in it', async () => {
    mockParams = new URLSearchParams('tab=plugs');
    const host = await settings();
    const rail = host.querySelector('[data-split-panel]');
    const box = host.querySelector('[data-panel="plugs"]')!.closest('form')!
      .parentElement!;

    expect(rail?.contains(tabs(host)[0])).toBe(true);
    expect(box.contains(rail)).toBe(false);
    expect(rail?.parentElement).toBe(box.parentElement!.parentElement);
  });
});

// The open tab is in the address (spec 059, FR-023, research R5), so a
// refresh reopens it. The page replaces the address, as Media does, and never
// pushes one, so Back leaves Settings. Global settings, the default, is left
// out, and every other parameter stays where it was: onboarding, which hides
// Log out, and loggedAuth, which customFetch reads from the address on every
// request.
describe('switching tabs', () => {
  let replace: jest.SpyInstance;
  let push: jest.SpyInstance;

  // Opens Settings at an address; every address write after it is recorded.
  const open = async (address: string) => {
    window.history.replaceState(null, '', address);
    mockParams = new URLSearchParams(window.location.search);
    replace = jest.spyOn(window.history, 'replaceState');
    push = jest.spyOn(window.history, 'pushState');
    return settings();
  };
  const pick = async (host: HTMLElement, label: string) => {
    const tab = tabs(host).find((node) => node.textContent === label);
    expect(tab).toBeDefined();
    await act(async () => {
      tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  };

  afterEach(() => {
    jest.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('writes the tab picked into the address as ?tab=<key> and opens its panel', async () => {
    const host = await open('/settings');
    await pick(host, 'Developers');

    expect(replace).toHaveBeenLastCalledWith(null, '', '/settings?tab=api');
    expect(panel(host)).toBe('api');
  });

  it('keeps every other parameter of the address in its place', async () => {
    const host = await open(
      '/settings?tab=plugs&loggedAuth=abc&onboarding=true'
    );
    await pick(host, 'Apps');

    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      '/settings?tab=apps&loggedAuth=abc&onboarding=true'
    );
  });

  it('leaves the tab out of the address for Global settings, the default', async () => {
    const host = await open('/settings?loggedAuth=abc&tab=plugs');
    await pick(host, 'Global Settings');

    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      '/settings?loggedAuth=abc'
    );
    expect(panel(host)).toBe('global_settings');

    const bare = await open('/settings?tab=plugs');
    await pick(bare, 'Global Settings');

    expect(replace).toHaveBeenLastCalledWith(null, '', '/settings');
  });

  it('never pushes an address, so Back leaves Settings', async () => {
    const host = await open('/settings');
    await pick(host, 'Plugs');
    await pick(host, 'Apps');
    await pick(host, 'Global Settings');

    expect(replace).toHaveBeenCalledTimes(3);
    expect(push).not.toHaveBeenCalled();
  });
});

// Settings scrolls in its card (spec 059, FR-002, contracts/routes.md). The
// window used to scroll, menu and panel together (1293px at 900 tall); the
// open tab's panel now scrolls inside PageScroll's box, the dashboard page's
// one scroller, with the pane's own 20px inset and 12px gap on the box, and the
// menu stays outside it. happy-dom applies no media queries or Tailwind, so the
// widths are pinned by the classes that carry them (page.scroll.spec pins
// PageScroll's own).
describe("the open tab's panel", () => {
  const HOST = ['bg-newBgColorInner', 'flex-1', 'min-w-0', 'relative'];
  const BOX = [
    'absolute',
    'inset-0',
    'overflow-y-auto',
    'flex',
    'flex-col',
    'mobile:static',
    'scrollbar',
    'scrollbar-thumb-fifth',
    'scrollbar-track-newBgColor',
  ];
  const classesOf = (el: Element) =>
    (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

  it("scrolls inside PageScroll's box, with the pane's inset and gap on the box, and the menu outside it", async () => {
    mockParams = new URLSearchParams('tab=plugs');
    const host = await settings();
    const form = host.querySelector('[data-panel="plugs"]')!.closest('form')!;
    const box = form.parentElement!;

    expect(classesOf(box.parentElement!)).toEqual(HOST);
    expect(classesOf(box)).toEqual([...BOX, 'p-[20px]', 'gap-[12px]']);
    expect(box.children).toHaveLength(1);
    expect(box.contains(tabs(host)[0])).toBe(false);
  });
});
