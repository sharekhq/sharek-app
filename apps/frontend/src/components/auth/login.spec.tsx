import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The Sign In page's heading and its main button take the app's sizes: one h1
// at the page-title scale, and the shared Button's large size instead of a
// 52px override. The request and the providers are stubbed.
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    isGeneral: true,
    genericOauth: false,
    appleClientId: '',
  }),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock(
  '@gitroom/frontend/components/auth/providers/github.provider',
  () => ({
    GithubProvider: () => null,
  })
);
jest.mock(
  '@gitroom/frontend/components/auth/providers/google.provider',
  () => ({
    GoogleProvider: () => null,
  })
);
jest.mock('@gitroom/frontend/components/auth/providers/apple.provider', () => ({
  AppleProvider: () => null,
}));
jest.mock('@gitroom/frontend/components/auth/providers/oauth.provider', () => ({
  OauthProvider: () => null,
}));
// Scenery: the links' prefetching needs the browser's idle callback.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

import { Login } from '@gitroom/frontend/components/auth/login';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const classes = (element: Element) => element.className.split(/\s+/);

describe('the Sign In page', () => {
  it('has one heading at the page-title scale', async () => {
    const host = await render(<Login />);

    const headings = host.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('Sign In');
    expect(classes(headings[0])).toEqual(
      expect.arrayContaining(['text-[32px]', 'font-[600]', 'leading-[1.2]'])
    );
    expect(classes(headings[0])).not.toContain('text-[40px]');
    expect(classes(headings[0])).not.toContain('text-3xl');
    expect(classes(headings[0])).not.toContain('font-bold');
  });

  it('submits with the shared large button', async () => {
    const host = await render(<Login />);

    const submit = host.querySelector('button[type="submit"]')!;
    expect(submit.textContent).toBe('Sign in');
    expect(classes(submit)).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]'])
    );
    expect(classes(submit)).not.toContain('!h-[52px]');
  });
});
