import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The rail as Settings left it: Plugs and Integrations moved into Settings, and
// Make UGC left with its modal. Each case starts from these switches; the
// beforeEach resets the three a case changes.
const variables = {
  isGeneral: true,
  billingEnabled: true,
  showUpstreamExtras: false,
  showThirdParty: false,
  supportEnabled: false,
};

jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => variables,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ orgId: 'org-1', tier: 'STANDARD', role: 'ADMIN' }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
// The rail item is replaced by its label: what is under test is which entries
// the menu decides to render, not how an entry looks.
jest.mock('@gitroom/frontend/components/new-layout/menu-item', () => ({
  MenuItem: ({ label }: { label: string }) => <div data-menu-item>{label}</div>,
}));

import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';

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
  variables.showUpstreamExtras = false;
  variables.showThirdParty = false;
  variables.supportEnabled = false;
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the side menu', () => {
  // Analytics stays where Sharek put it, after Media; Plugs moved into Settings.
  it('runs Calendar, Studio, Samy, Media and Analytics, then Billing and Settings', async () => {
    expect(await menu()).toEqual([
      'Calendar',
      'Studio',
      'Samy',
      'Media',
      'Analytics',
      'Billing',
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
