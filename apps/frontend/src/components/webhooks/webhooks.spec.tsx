import { act } from 'react';
import { createRoot } from 'react-dom/client';

const request = jest.fn<
  Promise<{ ok: boolean; json: () => Promise<unknown> }>,
  [string, RequestInit?]
>();

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: jest.fn() }),
}));
// The channel list and its picker only appear for "Specific integrations"; the
// test keeps "All".
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: undefined, isLoading: false }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/pick.platform.component',
  () => ({ PickPlatforms: () => null })
);

import { AddOrEditWebhook } from '@gitroom/frontend/components/webhooks/webhooks';

/**
 * Send Test posts two sample posts to the address the customer typed, so the
 * receiving end sees whatever the samples carry. Their channel pictures must
 * point at a neutral host rather than at any product's own upload server.
 */

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<AddOrEditWebhook reload={jest.fn()} />);
  });

  return host;
};

const type = async (element: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'value'
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('Send Test', () => {
  it('sends sample posts whose channel pictures sit on a neutral host', async () => {
    const host = await render();

    await type(
      host.querySelector('[name="name"]') as HTMLInputElement,
      'Orders'
    );
    await type(
      host.querySelector('[name="url"]') as HTMLInputElement,
      'https://hooks.example.org/sharek'
    );
    const sendTest = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Send Test'
    )!;
    expect(sendTest.disabled).toBe(false);
    await click(sendTest);

    const sent = request.mock.calls.find(([url]) =>
      url.startsWith('/webhooks/send?url=')
    );
    expect(sent).toBeTruthy();
    expect(sent![0]).toBe(
      `/webhooks/send?url=${encodeURIComponent(
        'https://hooks.example.org/sharek'
      )}`
    );

    const posts = JSON.parse(String(sent![1]!.body)) as Array<{
      integration: { picture: string };
    }>;
    expect(posts.length).toBeGreaterThan(0);
    const origins = posts.map(({ integration }) => {
      const picture = new URL(integration.picture);
      return `${picture.protocol}//${picture.hostname}`;
    });
    expect(origins).toEqual(posts.map(() => 'https://example.com'));
  });
});
