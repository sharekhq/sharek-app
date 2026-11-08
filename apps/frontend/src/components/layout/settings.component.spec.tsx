import { act, ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

// What decides the list: the plan and role on the user, the two server flags
// and the address. Billing and a lifetime plan decide the line above the build
// number. Each case sets them; beforeEach resets them.
const mockVariables = {
  isGeneral: true,
  showThirdParty: false,
  billingEnabled: false,
};
let mockUser: {
  role: string;
  tier: Record<string, string | boolean>;
  isLifetime?: boolean;
};
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

// A marker: the build number is placed against the logout control.
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  LogoutComponent: () => <div data-logout />,
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

// The tab column holds the labels and nothing else (the logout control and the
// build number sit below it). Read through the first tab's siblings, so the helper does not
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
  mockVariables.billingEnabled = false;
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

  it('turns the column into one sideways row up to 1025px', async () => {
    const host = await settings();
    const list = tabs(host)[0].parentElement!;

    expect(list.className).toContain('flex-col');
    expect(list.className).toContain('mobile:flex-row');
    expect(list.className).toContain('mobile:overflow-x-auto');
    for (const tab of tabs(host)) {
      expect(tab.className).toContain('mobile:shrink-0');
      expect(tab.className).toContain('mobile:whitespace-nowrap');
    }
    // An iPad held upright gets the row too: nothing in the tab panel stops at
    // the 768px phone screen any more.
    expect(list.parentElement!.outerHTML).not.toMatch(/\bphone:/);
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

  it('leaves the page alone where the tabs fit, as in the desktop column', async () => {
    strip(260, 260);
    mockParams = new URLSearchParams('tab=apps');
    await settings();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

// The build number, and above it the lifetime-tier line, moved here from the
// calendar's channel list, where a long one ran past the list's edge (R11).
describe('the build number under Log out', () => {
  const version = process.env.NEXT_PUBLIC_VERSION;
  // A full commit SHA, as the build stamps it: one word with nowhere to break.
  const build = '4e6e5627b1edbe5a6cf8e1d2a3b4c5d6e7f80912';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VERSION = build;
  });

  afterEach(() => {
    if (version === undefined) delete process.env.NEXT_PUBLIC_VERSION;
    else process.env.NEXT_PUBLIC_VERSION = version;
  });

  const line = (host: HTMLElement, text: string) =>
    Array.from(host.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent === text
    ) as HTMLElement | undefined;
  // Every class from the line up to the page's root, so a style set on the
  // line or on the block around it both count.
  const classesUp = (el: HTMLElement, host: HTMLElement) => {
    const found: string[] = [];
    for (let at: HTMLElement | null = el; at && at !== host; ) {
      found.push(at.className);
      at = at.parentElement;
    }
    return found.join(' ');
  };
  const follows = (first: Node, second: Node) =>
    !!(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
    );

  it('shows under Log out in 12px muted text that wraps', async () => {
    const host = await settings();
    const number = line(host, build)!;

    expect(number).toBeDefined();
    expect(follows(host.querySelector('[data-logout]')!, number)).toBe(true);
    const classes = classesUp(number, host);
    expect(classes).toContain('text-[12px]');
    expect(classes).toContain('text-muted');
    expect(classes).toContain('break-all');
    expect(classes).not.toMatch(
      /\b(truncate|text-ellipsis|whitespace-nowrap|text-nowrap)\b/
    );
  });

  it('stays on a phone, under the tab strip', async () => {
    const host = await settings();
    const number = line(host, build)!;
    const strip = tabs(host)[0].parentElement!;

    expect(number).toBeDefined();
    expect(classesUp(number, host)).not.toMatch(/(^|\s)([a-z]+:)*hidden\b/);
    expect(strip.contains(number)).toBe(false);
    expect(follows(strip, number)).toBe(true);
    // The column that holds both stacks them at every width, while the strip
    // inside it turns sideways.
    let column = number.parentElement!;
    while (!column.contains(strip)) column = column.parentElement!;
    expect(column.className).toContain('flex-col');
    expect(column.className).not.toContain('mobile:flex-row');
  });

  it('has the lifetime-tier line above it for a lifetime plan while billing is on', async () => {
    mockUser = { ...admin(), isLifetime: true };
    mockVariables.billingEnabled = true;
    const host = await settings();
    // lifetime_tier's "{{tier}} tier", with the plan's name filled in.
    const tier = line(host, 'Pro tier')!;
    const number = line(host, build)!;

    expect(mockAsked).toContain('lifetime_tier');
    expect(tier).toBeDefined();
    expect(number).toBeDefined();
    expect(follows(host.querySelector('[data-logout]')!, tier)).toBe(true);
    expect(follows(tier, number)).toBe(true);
    const classes = classesUp(tier, host);
    expect(classes).toContain('text-[12px]');
    expect(classes).toContain('text-muted');
    expect(classes).toContain('break-all');
  });

  it('has no lifetime-tier line while billing is off, or for a plan that is not lifetime', async () => {
    mockUser = { ...admin(), isLifetime: true };
    const unbilled = await settings();

    expect(line(unbilled, build)).toBeDefined();
    expect(line(unbilled, 'Pro tier')).toBeUndefined();

    mockUser = admin();
    mockVariables.billingEnabled = true;
    const notLifetime = await settings();

    expect(line(notLifetime, build)).toBeDefined();
    expect(line(notLifetime, 'Pro tier')).toBeUndefined();
  });
});
