import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// The auth layout renders each page as the only child of a flex row
// (app/(app)/auth/layout.tsx:30), so a page fills the 440px column only if its
// outermost element grows. Sign-in and sign-up put flex-1 on their form
// (login.tsx:63, register.tsx:146) and the forgot-password request page wraps
// its form in it (forgot.tsx:39). The page that sets the new password had
// neither, so its form shrank to the width of its inputs.
//
// The request page and the new-password page are two steps of one flow, so the
// submit button is asserted against the request page's own rather than against
// a copy of its classes: restyle one and this fails until the other follows.
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback?: string) => fallback ?? _key,
}));
// Scenery: the back-to-login link's prefetching needs the browser's idle callback.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));

import { Forgot } from '@gitroom/frontend/components/auth/forgot';
import { ForgotReturn } from '@gitroom/frontend/components/auth/forgot-return';

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

const outermost = (host: HTMLElement) =>
  host.firstElementChild!.className.split(/\s+/);

// Height and radius: the part of a Button's shape the page sets over its defaults.
const buttonShape = (host: HTMLElement) =>
  host
    .querySelector('button[type="submit"]')!
    .className.split(/\s+/)
    .filter((name) => /^!?(h|rounded)-/.test(name));

describe('the forgot-password flow', () => {
  it('lets the request page grow to fill the auth layout row', async () => {
    const host = await render(<Forgot />);

    expect(outermost(host)).toContain('flex-1');
  });

  it('lets the new-password page grow to fill the auth layout row', async () => {
    const host = await render(<ForgotReturn token="token" />);

    expect(outermost(host)).toContain('flex-1');
  });

  it('submits the new password with the same button as the request page', async () => {
    const request = await render(<Forgot />);
    const reset = await render(<ForgotReturn token="token" />);

    expect(buttonShape(reset)).toEqual(buttonShape(request));
  });
});

describe('the new-password page', () => {
  const classes = (element: Element) => element.className.split(/\s+/);

  it('has one heading at the page-title scale', async () => {
    const host = await render(<ForgotReturn token="token" />);

    const headings = host.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(classes(headings[0])).toEqual(
      expect.arrayContaining(['text-[32px]', 'font-[600]', 'leading-[1.2]'])
    );
    expect(classes(headings[0])).not.toContain('text-[40px]');
    expect(classes(headings[0])).not.toContain('text-3xl');
    expect(classes(headings[0])).not.toContain('font-bold');
  });

  it('changes the password with the shared large button', async () => {
    const host = await render(<ForgotReturn token="token" />);

    const submit = host.querySelector('button[type="submit"]')!;
    expect(submit.textContent).toBe('Change Password');
    expect(classes(submit)).toEqual(
      expect.arrayContaining(['h-[44px]', 'px-[20px]'])
    );
    expect(classes(submit)).not.toContain('!h-[52px]');
  });
});
