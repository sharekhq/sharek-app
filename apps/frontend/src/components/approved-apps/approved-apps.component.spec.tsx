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
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: [], mutate: () => undefined }),
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: () => undefined }),
}));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({
  deleteDialog: async () => false,
}));

import { ApprovedAppsComponent } from '@gitroom/frontend/components/approved-apps/approved-apps.component';

const mounted: Root[] = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

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
