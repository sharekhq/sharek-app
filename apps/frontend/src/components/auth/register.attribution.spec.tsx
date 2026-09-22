import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// What is under test is the body RegisterAfter posts: the form's own fields
// plus the attribution set UtmSaver stored on arrival, flat, on both the email
// path and the OAuth path after the provider round-trip. The resolver, the
// request and every hook the form reaches for are stubbed.
const request = jest.fn();
let attribution: Record<string, string> = {};

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
  useAttribution: () => attribution,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
// Scenery: the sign-in link's prefetching needs the browser's idle callback.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

import { RegisterAfter } from '@gitroom/frontend/components/auth/register';

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

const type = async (host: HTMLElement, name: string, value: string) => {
  const element = host.querySelector(`[name="${name}"]`) as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value'
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

// Validation, the request and the redirect that follows all resolve
// asynchronously after the submit event.
const submit = async (host: HTMLElement) => {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

const registration = () => {
  const [url, init] = request.mock.calls[0];
  return { url, body: JSON.parse(init.body) };
};

beforeEach(() => {
  attribution = { ref: 'x', utm_source: 'y' };
  request.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('registering', () => {
  it('posts the stored attribution set with an email registration', async () => {
    const host = await render(<RegisterAfter token="" provider="LOCAL" />);
    await type(host, 'email', 'a@b.c');
    await type(host, 'password', 'secret-1');
    await type(host, 'company', 'Acme');

    await submit(host);

    expect(registration()).toEqual({
      url: '/auth/register',
      body: {
        email: 'a@b.c',
        password: 'secret-1',
        company: 'Acme',
        provider: 'LOCAL',
        providerToken: '',
        datafast_visitor_id: '',
        ref: 'x',
        utm_source: 'y',
      },
    });
  });

  it('adds nothing to the body when no set is stored', async () => {
    attribution = {};
    const host = await render(<RegisterAfter token="" provider="LOCAL" />);
    await type(host, 'email', 'a@b.c');
    await type(host, 'password', 'secret-1');
    await type(host, 'company', 'Acme');

    await submit(host);

    expect(registration().body).toEqual({
      email: 'a@b.c',
      password: 'secret-1',
      company: 'Acme',
      provider: 'LOCAL',
      providerToken: '',
      datafast_visitor_id: '',
    });
  });

  // Back from the provider only the company is asked for; the set survived
  // the redirect in localStorage and goes with it.
  it('posts the stored attribution set after an OAuth round-trip', async () => {
    const host = await render(<RegisterAfter token="tok" provider="GOOGLE" />);
    await type(host, 'company', 'Acme');

    await submit(host);

    expect(registration()).toEqual({
      url: '/auth/register',
      body: {
        company: 'Acme',
        provider: 'GOOGLE',
        providerToken: 'tok',
        datafast_visitor_id: '',
        ref: 'x',
        utm_source: 'y',
      },
    });
  });
});
