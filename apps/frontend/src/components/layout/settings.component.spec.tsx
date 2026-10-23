import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What decides the list: the plan and role on the user, the two server flags
// and the address. Each case sets them; beforeEach resets them.
const mockVariables = { isGeneral: true, showThirdParty: false };
let mockUser: { role: string; tier: Record<string, string | boolean> };
let mockParams = new URLSearchParams();
const mockAsked: string[] = [];

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams,
}));
// Records every key asked for, so a case can say a key was never used.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => {
    mockAsked.push(key);
    return fallback ?? key;
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

// Scenery: the profile form, the modal stack and the logout control the
// component wires up. None of it is asserted on.
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => null,
}));
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

// The tab column holds the labels and nothing else (the logout control is
// mocked out). Read through the first tab's siblings, so the helper does not
// depend on the element a tab is drawn as.
const tabs = (host: HTMLElement) => {
  const first = Array.from(host.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && el.textContent === 'Global Settings'
  );
  return Array.from(first!.parentElement!.children) as HTMLElement[];
};
const labels = (host: HTMLElement) => tabs(host).map((tab) => tab.textContent);
const selected = (host: HTMLElement) =>
  tabs(host)
    .filter((tab) => tab.className.includes('bg-brandSoft'))
    .map((tab) => tab.textContent);
const panel = (host: HTMLElement) =>
  host.querySelector('[data-panel]')?.getAttribute('data-panel');

beforeEach(() => {
  mockUser = admin();
  mockVariables.isGeneral = true;
  mockVariables.showThirdParty = false;
  mockParams = new URLSearchParams();
  mockAsked.length = 0;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the Settings tabs', () => {
  it('runs in Sharek order, with Plugs and Apps last, for an admin on a paid plan', async () => {
    expect(labels(await settings())).toEqual([
      'Global Settings',
      'Teams',
      'Webhooks',
      'Auto Post',
      'Sets',
      'Signatures',
      'Developers',
      'Plugs',
      'Apps',
    ]);
  });

  it('shows Integrations, before Plugs, only when third-party integrations are switched on', async () => {
    expect(labels(await settings())).not.toContain('Integrations');

    mockVariables.showThirdParty = true;
    expect(labels(await settings()).slice(-4)).toEqual([
      'Developers',
      'Integrations',
      'Plugs',
      'Apps',
    ]);
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

describe('the tab list on a phone', () => {
  const overridden: Array<[string, PropertyDescriptor | undefined]> = [];
  const override = (name: string, descriptor: PropertyDescriptor) => {
    const proto = HTMLElement.prototype;
    overridden.push([name, Object.getOwnPropertyDescriptor(proto, name)]);
    Object.defineProperty(proto, name, { configurable: true, ...descriptor });
  };
  // happy-dom lays nothing out, so the strip's two widths are set by hand.
  const strip = (scrollWidth: number, clientWidth: number) => {
    override('scrollWidth', { get: () => scrollWidth });
    override('clientWidth', { get: () => clientWidth });
  };
  let scrollIntoView: jest.Mock;

  beforeEach(() => {
    scrollIntoView = jest.fn();
    override('scrollIntoView', { writable: true, value: scrollIntoView });
  });

  afterEach(() => {
    const proto = HTMLElement.prototype;
    for (const [name, original] of overridden.splice(0).reverse()) {
      if (original) Object.defineProperty(proto, name, original);
      else Reflect.deleteProperty(proto, name);
    }
  });

  it('draws every tab as a button a keyboard reaches, with a focus ring, and says which is open', async () => {
    mockParams = new URLSearchParams('tab=plugs');
    const all = tabs(await settings());

    for (const tab of all) {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab.getAttribute('type')).toBe('button');
      expect(tab.className).toContain('focus-visible:ring-2');
      expect(tab.className).toContain('focus-visible:ring-brand');
    }
    expect(
      all
        .filter((tab) => tab.getAttribute('aria-pressed') === 'true')
        .map((tab) => tab.textContent)
    ).toEqual(['Plugs']);
  });

  it('turns the column into one sideways strip on phones only', async () => {
    const host = await settings();
    const list = tabs(host)[0].parentElement!;

    expect(list.className).toContain('flex-col');
    expect(list.className).toContain('phone:flex-row');
    expect(list.className).toContain('phone:overflow-x-auto');
    for (const tab of tabs(host)) {
      expect(tab.className).toContain('phone:shrink-0');
      expect(tab.className).toContain('phone:whitespace-nowrap');
    }
    // iPads keep the side column: nothing here answers to Sharek's 1025px screen.
    expect(host.innerHTML).not.toMatch(/\bmobile:/);
  });

  it('opens with the tab the address names scrolled into view when the strip overflows', async () => {
    strip(900, 366);
    mockParams = new URLSearchParams('tab=apps');
    const host = await settings();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: 'center',
      block: 'nearest',
    });
    expect(scrollIntoView.mock.contexts[0]).toBe(
      tabs(host).find((tab) => tab.textContent === 'Apps')
    );
  });

  it('leaves the page alone where the tabs fit, as in the iPad and desktop column', async () => {
    strip(260, 260);
    mockParams = new URLSearchParams('tab=apps');
    await settings();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
