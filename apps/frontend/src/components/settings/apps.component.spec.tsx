// The Apps tab: an admin who can manage apps sees the OAuth apps they created
// beside the apps they approved; everyone else sees the approved apps only.
// The sub-tabs keep Sharek's Developers style.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/frontend/components/developer/developer.component', () => ({
  DeveloperComponent: () => <div data-panel="oauth-apps" />,
}));
jest.mock(
  '@gitroom/frontend/components/approved-apps/approved-apps.component',
  () => ({
    ApprovedAppsComponent: () => <div data-panel="approved-apps" />,
  })
);

import { AppsComponent } from '@gitroom/frontend/components/settings/apps.component';

const mounted: Root[] = [];

const apps = async (canManageApps: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AppsComponent canManageApps={canManageApps} />);
  });
  return host;
};
const panel = (host: HTMLElement) =>
  host.querySelector('[data-panel]')?.getAttribute('data-panel');
const subTabs = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the Apps tab', () => {
  it('gives an admin the OAuth apps first, beside the apps they approved', async () => {
    const host = await apps(true);

    expect(subTabs(host).map((tab) => tab.textContent)).toEqual([
      'Apps',
      'Approved Apps',
    ]);
    expect(panel(host)).toBe('oauth-apps');

    await act(async () => {
      subTabs(host)[1].click();
    });
    expect(panel(host)).toBe('approved-apps');
  });

  it('shows anyone who cannot manage apps the approved apps alone, with no sub-tabs', async () => {
    const host = await apps(false);

    expect(subTabs(host)).toHaveLength(0);
    expect(panel(host)).toBe('approved-apps');
    expect(host.querySelector('[data-panel="oauth-apps"]')).toBeNull();
  });

  // Developers' sub-tab style, which the OAuth apps carried before they moved:
  // the brand's soft fill for the open one, the quiet button for the other,
  // and a focus ring on both. Never upstream's purple or its retired grey.
  it("draws the sub-tabs in Sharek's Developers style", async () => {
    const [open, other] = subTabs(await apps(true));

    expect(open.className).toContain('bg-brandSoft');
    expect(open.className).toContain('text-brandText');
    expect(other.className).toContain('bg-btnSimple');
    expect(other.className).toContain('text-muted');
    for (const tab of [open, other]) {
      expect(tab.getAttribute('type')).toBe('button');
      expect(tab.className).toContain('focus-visible:ring-2');
      expect(tab.className).toContain('focus-visible:ring-brand');
      expect(tab.className).not.toMatch(/612BD3|customColor/i);
    }
  });
});
