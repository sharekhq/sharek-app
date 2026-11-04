import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// What is under test is what /auth shows for its query string. A provider with
// a code is an OAuth callback, which waits on the backend. A provider with no
// code has nothing to wait for: proxy.ts sends a logged-out click on /settings
// to /auth?provider=GITHUB, and that visitor needs the form and its Sign In
// link. The request and every hook the form reaches for are stubbed.
const request = jest.fn();
let search = new URLSearchParams();

jest.mock('@hookform/resolvers/class-validator', () => ({
  classValidatorResolver: () => async (values: Record<string, unknown>) => ({
    values,
    errors: {},
  }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/helpers/utils/utm.saver', () => ({
  useAttribution: () => ({}),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => search,
}));
jest.mock('react-use-cookie', () => ({
  __esModule: true,
  default: () => ['', () => undefined],
}));
jest.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    isGeneral: true,
    genericOauth: false,
    appleClientId: '',
  }),
}));
jest.mock('@gitroom/react/helpers/use.track', () => ({
  useTrack: () => async () => undefined,
}));
jest.mock('@gitroom/helpers/utils/use.fire.events', () => ({
  useFireEvents: () => () => undefined,
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
jest.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>loading</div>,
}));
// The link's prefetching needs the browser's idle callback; its target is the
// point here, so the stub keeps the href.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { Register } from '@gitroom/frontend/components/auth/register';

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

const answerWith = (body: Record<string, unknown>) => ({
  json: async () => body,
});

beforeEach(() => {
  search = new URLSearchParams();
  request.mockReset();
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('/auth with a provider and no code', () => {
  it('shows the form and its Sign In link, not the loading state', async () => {
    search = new URLSearchParams('provider=GITHUB');

    const host = await render(<Register />);

    expect(host.textContent).not.toContain('loading');
    expect(host.querySelector('[name="email"]')).not.toBeNull();
    expect(host.querySelector('[name="password"]')).not.toBeNull();
    expect(host.querySelector('a[href="/auth/login"]')?.textContent).toBe(
      'Sign In'
    );
    expect(request).not.toHaveBeenCalled();
  });
});

// A logged-out return from a channel's OAuth: proxy.ts sends
// /integrations/social/<x>?code=… to /auth with its query, and adds a provider
// only if the URL holds google or settings. No provider means no request to
// wait on.
describe('/auth with a code and no provider', () => {
  it('shows the form and its Sign In link, and asks the backend nothing', async () => {
    search = new URLSearchParams('code=abc');

    const host = await render(<Register />);

    expect(host.textContent).not.toContain('loading');
    expect(host.querySelector('[name="email"]')).not.toBeNull();
    expect(host.querySelector('a[href="/auth/login"]')?.textContent).toBe(
      'Sign In'
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the OAuth callback, a provider with a code', () => {
  it('asks the backend about the code and stays on loading until a token comes back', async () => {
    search = new URLSearchParams('provider=GOOGLE&code=abc&state=xyz');
    let answer!: (response: ReturnType<typeof answerWith>) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );

    const host = await render(<Register />);

    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('/auth/oauth/GOOGLE/exists');
    expect(JSON.parse(init.body)).toEqual({ code: 'abc', state: 'xyz' });
    expect(host.textContent).toContain('loading');
    expect(host.querySelector('form')).toBeNull();

    await act(async () => {
      answer(answerWith({ token: 'tok' }));
    });

    // Back from the provider only the company is asked for.
    expect(host.textContent).not.toContain('loading');
    expect(host.querySelector('[name="company"]')).not.toBeNull();
    expect(host.querySelector('[name="email"]')).toBeNull();
  });

  // An existing account: the backend answers with a cookie and a reload header,
  // no token, and the page stays on loading until the reload lands.
  it('stays on loading when the answer carries no token', async () => {
    search = new URLSearchParams('provider=GOOGLE&code=abc');
    request.mockResolvedValue(answerWith({ login: true }));

    const host = await render(<Register />);

    expect(request).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('loading');
    expect(host.querySelector('form')).toBeNull();
  });
});
