import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Upstream shows in Settings how the account signs in, and the address
// it signs in with where there is one. Sharek's Settings opens at 390px: the
// label and the address used to share one line there, and a long address ran
// out of the card. `t` answers the key itself, so each method's label is
// asserted by the key it reads.
let mockUser: { providerName?: string; email?: string } | undefined;

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => mockUser,
}));

import AuthenticationComponent from '@gitroom/frontend/components/settings/authentication.component';

const EMAIL = 'a.very.long.address.for.a.narrow.phone@sharek.example';

const mounted: Array<{ unmount: () => void }> = [];

const render = (providerName: string) => {
  mockUser = { providerName, email: EMAIL };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(<AuthenticationComponent />);
  });
  return host;
};

// The element holding the address, if the method shows one.
const email = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).find(
    (node) => node.textContent === EMAIL
  );

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockUser = undefined;
});

describe('the sign-in method in Settings', () => {
  it.each([
    ['LOCAL', 'auth_method_local'],
    ['GITHUB', 'auth_method_github'],
    ['GOOGLE', 'auth_method_google'],
    // Upstream's 743b9969 added this entry: the card showed nothing to an Apple user.
    ['APPLE', 'auth_method_apple'],
    ['FARCASTER', 'auth_method_farcaster'],
    ['WALLET', 'auth_method_wallet'],
    ['GENERIC', 'auth_method_generic'],
  ])('names %s by %s', (providerName, key) => {
    expect(render(providerName).textContent).toContain(key);
  });

  it('renders nothing for a method it does not know', () => {
    expect(render('UNKNOWN').innerHTML).toBe('');
  });

  it.each([
    ['LOCAL', true],
    ['GITHUB', true],
    ['GOOGLE', true],
    ['APPLE', true],
    ['FARCASTER', false],
    ['WALLET', false],
    ['GENERIC', false],
  ])('shows the address for %s: %s', (providerName, shown) => {
    expect(!!email(render(providerName))).toBe(shown);
  });

  it('fits a long address on a phone', () => {
    const host = render('LOCAL');
    const address = email(host)!;
    const row = address.parentElement!;

    expect(address.getAttribute('dir')).toBe('ltr');
    expect(address.getAttribute('title')).toBe(EMAIL);
    expect(address.className.split(' ')).toEqual(
      expect.arrayContaining(['min-w-0', 'max-w-full', 'truncate'])
    );
    expect(row.className.split(' ')).toEqual(
      expect.arrayContaining(['phone:flex-col', 'phone:items-start'])
    );
    expect(row.firstElementChild!.className.split(' ')).toContain('shrink-0');
  });

  // A card's corners are 12px with a 1px line, on Settings as on every other
  // page (FR-035), its content 20px in, 16px at 1025px and below (spec 060
  // FR-022).
  it('sits in a 12px card', () => {
    const card = render('LOCAL').firstElementChild as HTMLElement;

    expect(card.className.split(' ')).toEqual(
      expect.arrayContaining([
        'rounded-[12px]',
        'border',
        'border-fifth',
        'p-[20px]',
        'mobile:p-[16px]',
      ])
    );
    expect(card.className).not.toContain('rounded-[4px]');
    expect(card.className.split(' ')).not.toContain('p-[24px]');
  });

  // A card's title is semibold at the panel's 16px, as the review page draws
  // it (spec 059, walk fix).
  it('titles its card in semibold', () => {
    const card = render('LOCAL').firstElementChild as HTMLElement;
    const title = Array.from(card.children).find(
      (child) => child.textContent === 'authentication'
    )!;

    expect(title.className.split(' ')).toContain('font-[600]');
  });
});
