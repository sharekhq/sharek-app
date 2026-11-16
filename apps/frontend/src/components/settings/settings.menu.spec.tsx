import { act, ComponentProps } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Settings' menu (spec 059, US5, FR-020 to FR-022, FR-024, FR-025, FR-046;
// contracts/ui.md §6): each tab the list holds as a 36px row at 14px with its
// icon, in three groups, Global settings and Teams with no label, then
// Posting, then Connections; the open tab marked as Brands' list marks its
// brand; under the tabs Log out, the lifetime line and the version. Above
// 1025px it sits in SplitPanel; at 1025px and below it is one sideways strip,
// scrolled to the open tab. Which tabs the list holds is settings.component's
// business: here the list is handed in.

const mockAsked: string[] = [];
const mockVariables = { billingEnabled: false };
let mockUser: { tier: { current: string }; isLifetime?: boolean };
const mockLogout = jest.fn();
// What the menu last handed the split panel.
let mockSplit: ComponentProps<typeof SplitPanel> | undefined;

// Records every key asked for, and fills the default's placeholders from the
// values passed.
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
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => mockVariables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));
// The confirmation and what follows it are logout.component.spec's: here the
// row calls what useLogout() hands it.
jest.mock('@gitroom/frontend/components/layout/logout.component', () => ({
  useLogout: () => mockLogout,
}));
// Scenery: the ring is the channel list's, whose module loads the calendar's.
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  FOCUS_RING: 'focus-visible:ring-2 focus-visible:ring-brand',
}));
// Each icon is a marker that says which it is, its size and its colour.
jest.mock('@gitroom/frontend/components/ui/icons', () => {
  const marker = (name: string) => {
    const Icon = ({
      size,
      className,
    }: {
      size?: number;
      className?: string;
    }) => <svg data-icon={name} data-size={size} className={className} />;
    return Icon;
  };
  return Object.fromEntries(
    [
      'SlidersIcon',
      'UserIcon',
      'RssIcon',
      'LayersIcon',
      'PencilIcon',
      'CodeIcon',
      'LinkIcon',
      'PlugIcon',
      'GridIcon',
      'PuzzleIcon',
      'LogoutIcon',
    ].map((name) => [name, marker(name)])
  );
});
jest.mock('@gitroom/frontend/components/ui/split.panel', () => ({
  ...jest.requireActual('@gitroom/frontend/components/ui/split.panel'),
  SplitPanel: (props: ComponentProps<typeof SplitPanel>) => {
    mockSplit = props;
    return <aside data-split-panel="">{props.children}</aside>;
  },
}));

import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import { GROUP_LABEL } from '@gitroom/frontend/components/ui/split.panel';
import type { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
import { SettingsMenu } from '@gitroom/frontend/components/settings/settings.menu';

// settings.component's list for an admin on a paid plan with third-party
// integrations on, in the order it builds it, which is not the menu's.
const LIST = [
  { tab: 'global_settings', label: 'Global settings' },
  { tab: 'teams', label: 'Teams' },
  { tab: 'webhooks', label: 'Webhooks' },
  { tab: 'autopost', label: 'Auto post' },
  { tab: 'sets', label: 'Sets' },
  { tab: 'signatures', label: 'Signatures' },
  { tab: 'api', label: 'Developers' },
  { tab: 'integrations', label: 'Integrations' },
  { tab: 'plugs', label: 'Plugs' },
  { tab: 'apps', label: 'Apps' },
];
const without = (...tabs: string[]) =>
  LIST.filter((item) => !tabs.includes(item.tab));

// A row's look, the tabs' and Log out's.
const ROW = [
  'flex',
  'items-center',
  'gap-[10px]',
  'min-h-[36px]',
  'coarse:min-h-[44px]',
  'px-[10px]',
  'rounded-[8px]',
  'text-[14px]',
  'text-start',
  'focus-visible:ring-2',
  'focus-visible:ring-brand',
];
const IDLE = [
  'text-inkSoft',
  'font-[500]',
  'hover:bg-boxHover',
  'hover:text-ink',
];

// The window, as the media query reports it: wider than 1025px unless a case
// narrows it, before the menu mounts or after, telling the query's listeners
// as a browser does.
const realMatchMedia = window.matchMedia;
let smallWindow = false;
const listeners = new Set<() => void>();
const narrow = async () => {
  smallWindow = true;
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
};

const onChange = jest.fn();
const mounted: Root[] = [];

beforeEach(() => {
  mockAsked.length = 0;
  mockVariables.billingEnabled = false;
  mockUser = { tier: { current: 'PRO' } };
  mockSplit = undefined;
  smallWindow = false;
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

const menu = async (
  props: Partial<ComponentProps<typeof SettingsMenu>> = {}
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SettingsMenu
        list={LIST}
        tab="global_settings"
        onChange={onChange}
        showLogout
        {...props}
      />
    );
  });
  return host;
};

const click = async (node: Element | null | undefined) => {
  expect(node).toBeTruthy();
  await act(async () => {
    node!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const nav = (host: HTMLElement) => host.querySelector('nav')!;
const rows = (host: HTMLElement) =>
  Array.from(nav(host).querySelectorAll('button'));
const row = (host: HTMLElement, label: string) =>
  rows(host).find((node) => node.textContent === label)!;
const icon = (node: Element) => node.querySelector('svg[data-icon]')!;
const classes = (node: Element) =>
  (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// The groups as the menu draws them: each one's label, or null, and the words
// of its rows.
const groups = (host: HTMLElement) =>
  Array.from(nav(host).children).map((group) => ({
    label: group.querySelector('div[aria-hidden="true"]')?.textContent ?? null,
    rows: Array.from(group.querySelectorAll('button')).map(
      (node) => node.textContent
    ),
  }));
const button = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (node) => node.textContent === label
  );
const line = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && el.textContent === text
  ) as HTMLElement | undefined;
const follows = (first: Node, second: Node) =>
  !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('the Settings menu', () => {
  it('groups the tabs: Global settings and Teams with no label, then Posting, then Connections', async () => {
    expect(groups(await menu())).toEqual([
      { label: null, rows: ['Global settings', 'Teams'] },
      { label: 'Posting', rows: ['Auto post', 'Sets', 'Signatures'] },
      {
        label: 'Connections',
        rows: ['Developers', 'Webhooks', 'Plugs', 'Apps', 'Integrations'],
      },
    ]);
    expect(mockAsked).toEqual(
      expect.arrayContaining([
        'settings_group_posting',
        'settings_group_connections',
      ])
    );
  });

  it('names a labelled group for screen readers, and leaves the first unnamed', async () => {
    const [first, posting, connections] = Array.from(
      nav(await menu()).children
    );

    expect(first.getAttribute('role')).toBeNull();
    expect(first.getAttribute('aria-label')).toBeNull();
    expect(posting.getAttribute('role')).toBe('group');
    expect(posting.getAttribute('aria-label')).toBe('Posting');
    expect(connections.getAttribute('role')).toBe('group');
    expect(connections.getAttribute('aria-label')).toBe('Connections');
  });

  it('draws no Teams row for a member', async () => {
    expect(groups(await menu({ list: without('teams') }))[0]).toEqual({
      label: null,
      rows: ['Global settings'],
    });
  });

  it('draws no Posting group, label included, on the free plan', async () => {
    const host = await menu({
      list: LIST.filter((item) =>
        ['global_settings', 'plugs', 'apps'].includes(item.tab)
      ),
    });

    expect(groups(host)).toEqual([
      { label: null, rows: ['Global settings'] },
      { label: 'Connections', rows: ['Plugs', 'Apps'] },
    ]);
    expect(host.textContent).not.toContain('Posting');
  });

  it('ends Connections at Apps while third-party integrations are off', async () => {
    expect(groups(await menu({ list: without('integrations') }))[2]).toEqual({
      label: 'Connections',
      rows: ['Developers', 'Webhooks', 'Plugs', 'Apps'],
    });
  });

  it('gives each row its icon, 18px', async () => {
    const host = await menu();
    const drawn = (attribute: string) =>
      Object.fromEntries(
        LIST.map(({ tab, label }) => [
          tab,
          icon(row(host, label)).getAttribute(attribute),
        ])
      );

    expect(drawn('data-icon')).toEqual({
      global_settings: 'SlidersIcon',
      teams: 'UserIcon',
      autopost: 'RssIcon',
      sets: 'LayersIcon',
      signatures: 'PencilIcon',
      api: 'CodeIcon',
      webhooks: 'LinkIcon',
      plugs: 'PlugIcon',
      apps: 'GridIcon',
      integrations: 'PuzzleIcon',
    });
    expect(new Set(Object.values(drawn('data-size')))).toEqual(new Set(['18']));
  });

  it("marks the open tab as Brands' list marks its brand, and says it is pressed", async () => {
    const host = await menu({ tab: 'plugs' });
    const open = row(host, 'Plugs');

    expect(open.getAttribute('aria-pressed')).toBe('true');
    expect(classes(open)).toEqual(
      expect.arrayContaining(['bg-brandSoft2', 'text-ink', 'font-[600]'])
    );
    expect(classes(icon(open))).toContain('text-brand');
    for (const other of rows(host).filter((node) => node !== open)) {
      expect(other.getAttribute('aria-pressed')).toBe('false');
      expect(classes(other)).toEqual(expect.arrayContaining(IDLE));
      expect(classes(other)).not.toContain('bg-brandSoft2');
      expect(classes(other)).not.toContain('font-[600]');
      expect(classes(icon(other))).toContain('text-muted');
      expect(classes(icon(other))).not.toContain('text-brand');
    }
  });

  it('draws each row as a button 36px tall at 14px, 44px under a coarse pointer, with a focus ring', async () => {
    const all = rows(await menu());

    expect(all).toHaveLength(LIST.length);
    for (const node of all) {
      expect(node.tagName).toBe('BUTTON');
      expect(node.getAttribute('type')).toBe('button');
      expect(classes(node)).toEqual(expect.arrayContaining(ROW));
    }
  });

  it('opens the tab clicked', async () => {
    const host = await menu();
    await click(row(host, 'Sets'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('sets');
  });

  it("labels a group in the panels' group look, which the strip and screen readers skip", async () => {
    const labels = Array.from(
      nav(await menu()).querySelectorAll('div[aria-hidden="true"]')
    );

    expect(labels.map((label) => label.textContent)).toEqual([
      'Posting',
      'Connections',
    ]);
    for (const label of labels) {
      expect(classes(label)).toEqual([
        ...GROUP_LABEL.split(' '),
        'mobile:hidden',
      ]);
    }
  });
});

describe("the menu's place on the page", () => {
  it('sits in SplitPanel, 260px wide and named Settings, above 1025px', async () => {
    const host = await menu();

    expect(mockSplit?.width).toBe('w-[260px]');
    expect(mockSplit?.label).toBe('Settings');
    expect(host.querySelector('[data-split-panel]')?.contains(nav(host))).toBe(
      true
    );
    expect(nav(host).getAttribute('aria-label')).toBe('Settings');
  });

  it('sits in a box of the panel colour with 12px around at 1025px and below', async () => {
    smallWindow = true;
    const host = await menu();

    expect(host.querySelector('[data-split-panel]')).toBeNull();
    expect(classes(nav(host).parentElement!)).toEqual([
      'bg-newBgColorInner',
      'p-[12px]',
    ]);
    expect(nav(host).getAttribute('aria-label')).toBe('Settings');
  });

  it('turns into one sideways strip at 1025px and below, its groups unboxed', async () => {
    const host = await menu();

    expect(classes(nav(host))).toEqual(
      expect.arrayContaining([
        'flex',
        'flex-col',
        'gap-[2px]',
        'pt-[12px]',
        'flex-1',
        'mobile:flex-row',
        'mobile:pt-0',
        'mobile:gap-[8px]',
        'mobile:overflow-x-auto',
        'mobile:pb-[6px]',
      ])
    );
    for (const group of Array.from(nav(host).children)) {
      expect(classes(group)).toEqual(
        expect.arrayContaining([
          'flex',
          'flex-col',
          'gap-[2px]',
          'mobile:contents',
        ])
      );
    }
    for (const node of rows(host)) {
      expect(classes(node)).toEqual(
        expect.arrayContaining([
          'mobile:shrink-0',
          'mobile:whitespace-nowrap',
          'mobile:px-[14px]',
        ])
      );
    }
  });
});

describe('the strip on a small screen', () => {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView'
  );
  const scrollIntoView = jest.fn();

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  // happy-dom lays nothing out: every element measures 0 by 0. From here on
  // each nav element made carries the strip's two widths and nothing else
  // does, so a group, mobile:contents with no box of its own, still measures
  // nothing, as in a browser.
  const stripMeasures = (scrollWidth: number, clientWidth: number) => {
    const create = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions
    ) => {
      const element = create(tagName, options);
      if (tagName === 'nav') {
        Object.defineProperties(element, {
          scrollWidth: { configurable: true, get: () => scrollWidth },
          clientWidth: { configurable: true, get: () => clientWidth },
        });
      }
      return element;
    }) as typeof document.createElement);
  };

  // On a phone the first render is the wide one, the menu in SplitPanel,
  // hidden there and measuring nothing: useMediaQuery answers false until it
  // has mounted. The strip comes once the query turns true.
  it('scrolls the open tab into view once the strip is drawn and overflows', async () => {
    const host = await menu({ tab: 'apps' });
    expect(scrollIntoView).not.toHaveBeenCalled();

    stripMeasures(900, 366);
    await narrow();

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: 'center',
      block: 'nearest',
    });
    expect(scrollIntoView.mock.contexts[0]).toBe(row(host, 'Apps'));
  });

  it('leaves the strip alone where its tabs fit', async () => {
    await menu({ tab: 'apps' });
    stripMeasures(366, 366);
    await narrow();

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("the menu's foot", () => {
  const version = process.env.NEXT_PUBLIC_VERSION;
  // A full commit SHA, as the build stamps it.
  const build = '111ebeb9e4c0d2f7a8b3e6c1d9f0a2b4c6d8e0f1';

  beforeEach(() => {
    process.env.NEXT_PUBLIC_VERSION = build;
  });

  afterEach(() => {
    if (version === undefined) delete process.env.NEXT_PUBLIC_VERSION;
    else process.env.NEXT_PUBLIC_VERSION = version;
  });

  const logOut = (host: HTMLElement) => button(host, 'Log out');

  it("starts with Log out under the tabs, a quiet row in the menu's look with the logout icon", async () => {
    const host = await menu();
    const node = logOut(host)!;

    expect(node).toBeDefined();
    expect(mockAsked).toContain('log_out');
    expect(mockAsked).not.toContain('logout_from_sharek');
    expect(nav(host).contains(node)).toBe(false);
    expect(follows(nav(host), node)).toBe(true);
    expect(node.getAttribute('type')).toBe('button');
    expect(node.hasAttribute('aria-pressed')).toBe(false);
    expect(classes(node)).toEqual(expect.arrayContaining([...ROW, ...IDLE]));
    expect(node.outerHTML).not.toMatch(
      /\b(text-error|text-red|bg-error|bg-red|text-danger|bg-danger)/
    );
    expect(icon(node).getAttribute('data-icon')).toBe('LogoutIcon');
    expect(icon(node).getAttribute('data-size')).toBe('18');
    expect(classes(icon(node))).toContain('text-muted');
    expect(classes(node.parentElement!)).toEqual([
      'flex',
      'flex-col',
      'gap-[2px]',
      'border-t',
      'border-line',
      'pt-[10px]',
      'mt-[12px]',
      'mobile:mt-[8px]',
    ]);
  });

  it("opens useLogout's confirmation", async () => {
    const host = await menu();
    await click(logOut(host));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('has no Log out where the page hides it, and keeps the version', async () => {
    const host = await menu({ showLogout: false });

    expect(logOut(host)).toBeUndefined();
    expect(line(host, 'Version 111ebeb')).toBeDefined();
  });

  it('keeps the lifetime line under Log out and above the version, while billing is on', async () => {
    mockUser = { tier: { current: 'PRO' }, isLifetime: true };
    mockVariables.billingEnabled = true;
    const host = await menu();
    // lifetime_tier's "{{tier}} tier", with the plan's name filled in.
    const tier = line(host, 'Pro tier')!;

    expect(mockAsked).toContain('lifetime_tier');
    expect(tier).toBeDefined();
    expect(classes(tier)).toEqual(['text-[12px]', 'text-muted', 'px-[10px]']);
    expect(follows(logOut(host)!, tier)).toBe(true);
    expect(follows(tier, line(host, 'Version 111ebeb')!)).toBe(true);
  });

  it('has no lifetime line while billing is off, or for a plan that is not lifetime', async () => {
    mockUser = { tier: { current: 'PRO' }, isLifetime: true };
    expect(line(await menu(), 'Pro tier')).toBeUndefined();

    mockUser = { tier: { current: 'PRO' } };
    mockVariables.billingEnabled = true;
    expect(line(await menu(), 'Pro tier')).toBeUndefined();
  });

  it("ends with Version and the build's first 7 characters", async () => {
    expect(build).toHaveLength(40);
    const host = await menu();
    const number = line(host, 'Version 111ebeb')!;

    expect(number).toBeDefined();
    expect(mockAsked).toContain('settings_version');
    expect(host.textContent).not.toContain(build);
    expect(classes(number)).toEqual([
      'font-mono',
      'text-[11.5px]',
      'text-muted',
      'px-[10px]',
      'py-[4px]',
    ]);
    expect(number.parentElement).toBe(logOut(host)!.parentElement);
    expect(follows(logOut(host)!, number)).toBe(true);
  });

  it('has no version line when the build stamps none', async () => {
    process.env.NEXT_PUBLIC_VERSION = '';
    const host = await menu();

    expect(mockAsked).not.toContain('settings_version');
    expect(host.textContent).not.toContain('Version');
  });

  it('stays at 1025px and below, under the strip', async () => {
    smallWindow = true;
    const host = await menu();
    const number = line(host, 'Version 111ebeb')!;

    expect(number).toBeDefined();
    expect(nav(host).contains(number)).toBe(false);
    expect(follows(nav(host), number)).toBe(true);
    expect(nav(host).parentElement!.contains(number)).toBe(true);
  });
});
