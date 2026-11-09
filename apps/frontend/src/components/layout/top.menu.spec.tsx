import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The rail as Settings left it: Plugs and Integrations moved into Settings, and
// Make UGC left with its modal. Each case starts from these switches, this
// user and no translations; the beforeEach resets what a case changes.
const variables = {
  isGeneral: true,
  billingEnabled: true,
  showUpstreamExtras: false,
  showThirdParty: false,
  supportEnabled: false,
};
const user = { orgId: 'org-1', tier: 'STANDARD', role: 'ADMIN' };
// A key with no translation here reads as its English default.
const translations: Record<string, string> = {};

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => user,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) =>
    translations[key] ?? fallback ?? key,
}));
// The rail item is replaced by its label and its path: what is under test is
// which entries the menu decides to render, not how an entry looks.
jest.mock('@gitroom/frontend/components/new-layout/menu-item', () => ({
  MenuItem: ({ label, path }: { label: string; path: string }) => (
    <div data-menu-item data-path={path}>
      {label}
    </div>
  ),
}));

import {
  TopMenu,
  useMenuItem,
} from '@gitroom/frontend/components/layout/top.menu';

const mounted: Array<{ unmount: () => void }> = [];

const menu = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<TopMenu />);
  });

  return Array.from(host.querySelectorAll('[data-menu-item]')).map(
    (item) => item.textContent
  );
};

beforeEach(() => {
  variables.billingEnabled = true;
  variables.showUpstreamExtras = false;
  variables.showThirdParty = false;
  variables.supportEnabled = false;
  user.tier = 'STANDARD';
  user.role = 'ADMIN';
  Object.keys(translations).forEach((key) => delete translations[key]);
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the side menu', () => {
  // Analytics stays where Sharek put it, after Media; Plugs moved into Settings.
  // Brands ends the top group, after Analytics (spec 053, FR-002).
  it('runs Calendar, Studio, Samy, Media, Analytics and Brands, then Billing and Settings', async () => {
    expect(await menu()).toEqual([
      'Calendar',
      'Studio',
      'Samy',
      'Media',
      'Analytics',
      'Brands',
      'Billing',
      'Settings',
    ]);
  });

  // The rail's short word is the brands key's, العلامات in Arabic.
  it('leads Brands to /brands, labelled by the brands key', async () => {
    translations.brands = 'العلامات';
    await menu();

    expect(document.querySelector('[data-path="/brands"]')?.textContent).toBe(
      'العلامات'
    );
  });

  // The page's heading names Brands in full, العلامات التجارية, where the rail
  // has room only for العلامات (spec 053, US1 scenario 11). No other item has a
  // title of its own, so every other heading stays its rail label.
  it('titles the Brands page by the brands_all_brands key, and no other page', async () => {
    translations.brands = 'العلامات';
    translations.brands_all_brands = 'العلامات التجارية';
    let items: ReturnType<typeof useMenuItem>['all'] = [];
    const Probe = () => {
      items = useMenuItem().all;
      return null;
    };
    const root = createRoot(document.createElement('div'));
    mounted.push(root);
    await act(async () => {
      root.render(<Probe />);
    });

    expect(
      items.filter((item) => item.title).map(({ path, title }) => [path, title])
    ).toEqual([['/brands', 'العلامات التجارية']]);
  });

  // Brands has no switch, plan or role of its own: it shows exactly when the
  // other top items do (FR-008, FR-009). The top group is hidden for a free
  // tier while billing is on, and Billing is for admins only.
  it('shows Brands exactly when the rest of the top group shows', async () => {
    user.tier = 'FREE';
    expect(await menu()).toEqual(['Billing', 'Settings']);

    variables.billingEnabled = false;
    expect(await menu()).toEqual([
      'Calendar',
      'Studio',
      'Samy',
      'Media',
      'Analytics',
      'Brands',
      'Settings',
    ]);

    user.tier = 'STANDARD';
    user.role = 'USER';
    variables.billingEnabled = true;
    expect(await menu()).toEqual([
      'Calendar',
      'Studio',
      'Samy',
      'Media',
      'Analytics',
      'Brands',
      'Settings',
    ]);
  });

  // Plugs and Integrations live in Settings now, and Make UGC left with its
  // modal: no switch brings any of them back to the rail.
  it('has no Plugs, Integrations or Make UGC entry, whatever the switches say', async () => {
    variables.showUpstreamExtras = true;
    variables.showThirdParty = true;
    const items = await menu();

    expect(items).not.toContain('Plugs');
    expect(items).not.toContain('Integrations');
    expect(items).not.toContain('Make UGC');
    // The menu did render: an unrelated empty rail would otherwise pass.
    expect(items).toContain('Settings');
  });

  // What showUpstreamExtras still hides on the rail.
  it('keeps the Affiliate link behind showUpstreamExtras', async () => {
    expect(await menu()).not.toContain('Affiliate');

    variables.showUpstreamExtras = true;
    expect(await menu()).toContain('Affiliate');
  });
});
