// The Apps tab: an admin who can manage apps sees the OAuth apps they created
// beside the apps they approved; everyone else sees the approved apps only.
// The sub-tabs are the dashboard's one view switch.
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
import {
  SWITCH_GROUP,
  SWITCH_OPTION,
  SWITCH_OPTION_IDLE,
  SWITCH_OPTION_ON,
} from '@gitroom/frontend/components/ui/pick.controls';

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
const words = (value: string) => value.split(' ');
const classes = (element: Element) => element.className.split(' ');
// Which half of the switch an option carries, whole and alone: 'on', 'idle',
// or 'mixed' for anything else.
const half = (option: Element) => {
  const own = classes(option);
  expect(own).toEqual(expect.arrayContaining(words(SWITCH_OPTION)));
  const has = (value: string) =>
    words(value).filter((name) => own.includes(name)).length;
  const on = has(SWITCH_OPTION_ON);
  const idle = has(SWITCH_OPTION_IDLE);
  if (on === words(SWITCH_OPTION_ON).length && !idle) return 'on';
  if (idle === words(SWITCH_OPTION_IDLE).length && !on) return 'idle';
  return 'mixed';
};

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

  // One switch look for every view switch (FR-032): the open sub-tab takes
  // the current half, the other the idle half, never both, as Tailwind emits
  // the idle colours after the current ones. Never upstream's purple or its
  // retired grey.
  it("draws the sub-tabs in the dashboard's one switch look", async () => {
    const host = await apps(true);
    const [open, other] = subTabs(host);

    expect(classes(open.parentElement!)).toEqual(
      expect.arrayContaining(words(SWITCH_GROUP))
    );
    expect([half(open), half(other)]).toEqual(['on', 'idle']);
    for (const tab of [open, other]) {
      expect(tab.getAttribute('type')).toBe('button');
      expect(tab.className).toContain('focus-visible:ring-2');
      expect(tab.className).toContain('focus-visible:ring-brand');
      expect(tab.className).not.toMatch(/612BD3|customColor|btnSimple/i);
    }

    await act(async () => {
      other.click();
    });
    expect(subTabs(host).map(half)).toEqual(['idle', 'on']);
  });

  // FR-035: a panel's heading is 20px semibold.
  it('heads the tab at 20px semibold', async () => {
    expect(classes((await apps(false)).querySelector('h3')!)).toEqual(
      expect.arrayContaining(['text-[20px]', 'font-[600]'])
    );
  });
});
