import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The consent screen an AI client (Claude, ChatGPT, Cursor) opens to connect
// to a Sharek account. Upstream's version arrived with its own product name,
// raw English and stock colours; Sharek's port reads every string through a
// key. `t` and `i18next.t` answer the key itself here, so a string that skips
// a key shows up as English in the text.
const request = jest.fn();
let query = '';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/frontend/components/new-layout/logo', () => ({
  Logo: () => null,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

import { OAuthAuthorize } from '@gitroom/frontend/components/oauth/authorize.component';

const consentQuery =
  'client_id=pcd_abc&response_type=code&state=s1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=xyz&code_challenge_method=S256';
const appInfo = {
  app: {
    name: 'Claude',
    description: null as string | null,
    picture: null as { path: string } | null,
    clientId: 'pcd_abc',
  },
  state: 's1',
  selfHosted: false,
  selfHostedEmail: false,
};

const mounted: Array<{ unmount: () => void }> = [];

const render = async (logged: boolean) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<OAuthAuthorize logged={logged} />);
  });
  // The request the screen makes on mount settles on the next tick.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return host;
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

const buttons = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('button'));

// Navigation is observed, not performed.
const location = window.location;

beforeEach(() => {
  query = consentQuery;
  request.mockReset();
  request.mockImplementation(async (_url: string, options?: RequestInit) => ({
    json: async () =>
      options?.method === 'POST'
        ? {
            redirect:
              'https://claude.ai/api/mcp/auth_callback?code=c1&state=s1',
          }
        : appInfo,
  }));
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: `https://dash.sharek.app/oauth/authorize?${consentQuery}` },
  });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: location,
  });
});

describe('signed out', () => {
  it('offers sign-in only, and comes back to this exact consent URL', async () => {
    const host = await render(false);
    expect(buttons(host)).toHaveLength(1);
    const href = window.location.href;

    await click(buttons(host)[0]);

    expect(window.location.href).toBe(
      `/auth/login?returnUrl=${encodeURIComponent(href)}`
    );
  });

  it('labels the button through a key and never names the upstream product', async () => {
    const host = await render(false);

    expect(host.textContent).not.toMatch(/postiz/i);
    expect(buttons(host)[0].textContent).toBe('sign_in_to_sharek');
  });
});

describe('signed in', () => {
  it('approves with the PKCE fields and follows the redirect', async () => {
    const host = await render(true);
    const approve = buttons(host).find(
      (button) => button.textContent === 'authorize'
    )!;

    await click(approve);

    const [url, options] = request.mock.calls.find(
      ([, init]) => init?.method === 'POST'
    )!;
    expect(url).toBe('/oauth/authorize');
    expect(JSON.parse(options.body)).toEqual({
      client_id: 'pcd_abc',
      state: 's1',
      action: 'approve',
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: 'xyz',
      code_challenge_method: 'S256',
    });
    expect(window.location.href).toBe(
      'https://claude.ai/api/mcp/auth_callback?code=c1&state=s1'
    );
  });

  it('shows no self-hosted option while the relay is off', async () => {
    const host = await render(true);

    expect(buttons(host).map((button) => button.textContent)).toEqual([
      'authorize',
      'deny',
    ]);
  });
});

describe('errors', () => {
  it('translates the unsupported response_type message', async () => {
    query = 'client_id=pcd_abc&response_type=token';

    const host = await render(true);

    expect(host.textContent).toContain('oauth_only_code_response_type');
  });

  it('translates the missing parameters message', async () => {
    query = 'state=s1';

    const host = await render(true);

    expect(host.textContent).toContain(
      'missing_required_parameters_client_id_response_type'
    );
  });
});
