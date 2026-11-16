import { act, FC } from 'react';
import { createRoot } from 'react-dom/client';
import { buttonClassName } from '@gitroom/react/form/button';

// What is under test is the look of the Google and Apple buttons on the
// sign-in pages: the shared secondary large button, which follows the theme,
// instead of upstream's white tile made for a dark page. The OAuth request is
// stubbed; a click must still ask for the provider's link.
const request = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

import { GoogleProvider } from '@gitroom/frontend/components/auth/providers/google.provider';
import { AppleProvider } from '@gitroom/frontend/components/auth/providers/apple.provider';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (Provider: FC) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<Provider />);
  });
  return host;
};

const SHARED = buttonClassName({ variant: 'secondary', size: 'large' }).split(
  ' '
);

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ text: async () => '#oauth' });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe.each([
  ['GoogleProvider', GoogleProvider, '/auth/oauth/GOOGLE'],
  ['AppleProvider', AppleProvider, '/auth/oauth/APPLE'],
])('%s', (_name, Provider, link) => {
  it('renders one plain button with the shared secondary large look', async () => {
    const host = await render(Provider);

    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('type')).toBe('button');
    const classes = buttons[0].className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['flex-1', ...SHARED]));
    ['bg-white', 'h-[52px]', 'rounded-[10px]', 'text-[#0E0E0E]'].forEach(
      (old) => expect(classes).not.toContain(old)
    );
  });

  it('fetches its OAuth link on a click', async () => {
    const host = await render(Provider);

    await act(async () => {
      (host.firstElementChild as HTMLElement).click();
    });

    expect(request).toHaveBeenCalledWith(link);
  });
});

describe('AppleProvider', () => {
  it("draws its logo in the button's ink, not black", async () => {
    const host = await render(AppleProvider);

    const path = host.querySelector('svg path');
    expect(path?.getAttribute('fill')).toBe('currentColor');
    expect(host.innerHTML).not.toContain('#000000');
  });
});
