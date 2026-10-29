import 'reflect-metadata';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Add Channel and, beside it, the icon that sends a customer an invite link to
// add a channel themselves.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => async () => new Response('[]'),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined }),
}));

import { AddProviderButton } from '@gitroom/frontend/components/launches/add.provider.component';

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<AddProviderButton />);
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the invite link button', () => {
  // The app's tooltip does not show on a touch screen, so the icon carries the
  // name its tooltip gave it.
  it('is named by its tooltip', async () => {
    const host = await render();
    const invite = host.querySelector('[data-tooltip-id="tooltip"]')!;

    expect(invite.tagName).toBe('BUTTON');
    expect(invite.getAttribute('aria-label')).toBe(
      'Send Invite Link to a customer to add channel'
    );
  });
});
