import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The Instagram settings' audio search. 044 T071 F-2: under 16px, iOS Safari
// zooms the page when a field takes the focus and leaves it zoomed, so the
// composer read too wide on an iPhone.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));
jest.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({ getValues: () => ({}) }),
}));
jest.mock(
  '@gitroom/frontend/components/launches/helpers/use.custom.provider.function',
  () => ({
    useCustomProviderFunction: () => ({ get: async () => [] }),
  })
);

import { InstagramAudioSelector } from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.audio';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the audio search under a finger', () => {
  it('types at 16px on a touch screen, 14px with a mouse', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <InstagramAudioSelector
          name="audio"
          label="Audio"
          onChange={jest.fn()}
        />
      );
    });
    const add = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Add audio'
    );
    await act(async () => {
      add!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const search = host.querySelector(
      'input[placeholder="Search audio (empty shows trending)"]'
    );

    expect(search).toBeTruthy();
    expect(search!.className.split(' ')).toEqual(
      expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
    );
  });
});
