// The approved apps sit under the Apps tab, which names them, so the list has
// no heading of its own and keeps Sharek's subtitle.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => ({ json: async () => [] }),
}));
let mockApps: unknown[] = [];
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: mockApps, mutate: () => undefined }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));

import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';

const mounted: Root[] = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<ApprovedAppsComponent />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockApps = [];
});

const classes = (node: Element) => node.className.split(/\s+/);

describe('the approved apps under Apps', () => {
  it("drops its own heading and keeps Sharek's subtitle", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(<ApprovedAppsComponent />);
    });

    expect(host.querySelector('h3')).toBeNull();
    expect(host.textContent).not.toContain('Approved Apps');
    const subtitle = Array.from(host.querySelectorAll('div')).find(
      (el) =>
        el.children.length === 0 &&
        el.textContent?.startsWith('Applications you have authorized')
    )!;
    expect(subtitle.textContent).toBe(
      'Applications you have authorized to access your Sharek account.'
    );
    expect(subtitle.className).toBe('text-muted');
  });
});

// The dashboard's one button set: a row's Revoke is small red text with no
// fill, and the list's card and each app's row have 12px corners.
describe('the approved apps in the dashboard look', () => {
  const app = {
    id: 'app-1',
    createdAt: '2026-11-01T10:00:00.000Z',
    oauthApp: { name: 'Probe App', description: 'Posts for the team' },
  };

  it('rounds the card 12px when no app is approved yet', async () => {
    const host = await render();
    const card = host.querySelector('.border.p-\\[24px\\]')!;

    expect(classes(card)).toEqual(
      expect.arrayContaining(['bg-sixth', 'border-fifth', 'rounded-[12px]'])
    );
    expect(classes(card)).not.toContain('rounded-[4px]');
  });

  it("rounds each app's row 12px and draws its Revoke as small red text with no fill", async () => {
    mockApps = [app];
    const host = await render();
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Revoke'
    )!;
    const row = revoke.parentElement!;

    expect(classes(row)).toEqual(
      expect.arrayContaining(['border-fifth', 'rounded-[12px]'])
    );
    expect(classes(row)).not.toContain('rounded-[4px]');
    expect(classes(revoke)).toEqual(
      expect.arrayContaining([
        'bg-transparent',
        'text-error',
        'h-[32px]',
        'px-[12px]',
        'text-[13px]',
        'phone:w-full',
      ])
    );
    expect(classes(revoke)).not.toContain('bg-brand');
  });
});
