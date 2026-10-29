import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
jest.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: jest.fn() }),
}));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => jest.fn(),
}));
jest.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ closeAll: jest.fn() }),
}));
let swrData: unknown;
jest.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: swrData, isLoading: false, mutate: jest.fn() }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/pick.platform.component',
  () => ({ PickPlatforms: () => null })
);
// The add/edit form's rich-text field; the real one pulls the whole assistant
// runtime in, and this page imports it at load.
jest.mock('@copilotkit/react-textarea', () => ({
  CopilotTextarea: ({ placeholder }: { placeholder?: string }) => (
    <textarea readOnly placeholder={placeholder} />
  ),
}));

import { Autopost } from '@gitroom/frontend/components/autopost/autopost';

const mounted: Array<{ unmount: () => void }> = [];

const render = async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);

  await act(async () => {
    root.render(<Autopost />);
  });

  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe("an Auto Post feed's URL", () => {
  const url = `https://feeds.example.org/${'a'.repeat(120)}/`;

  it('cuts at its end, reading left to right in Arabic too', async () => {
    swrData = [{ id: 'feed-1', title: 'News', url, active: true }];
    const host = await render();

    // A truncating block cuts at its inline end, so the block itself has to be
    // left to right for the ellipsis to land after the URL, not before it.
    const block = host.querySelector(`[title="${url}"]`)!;
    expect(block.textContent).toBe(url);
    expect(block.getAttribute('dir')).toBe('ltr');
    expect(block.className.split(' ')).toContain('truncate');
  });
});
