import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

// The TikTok settings' music and location searches. 044 T071 F-2: under 16px,
// iOS Safari zooms the page when a field takes the focus and leaves it
// zoomed, so the composer read too wide on an iPhone.
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

import { TikTokMusicSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.music';
import { TikTokLocationSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.location';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactElement) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

const openSearch = async (host: HTMLElement, label: string) => {
  // the innermost element holding the label is the one with the handler
  const trigger = Array.from(host.querySelectorAll('div'))
    .filter((node) => node.textContent === label)
    .at(-1);
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return host.querySelector('input:not([type])');
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('the TikTok searches under a finger', () => {
  it.each([
    [
      'music',
      'Add music',
      <TikTokMusicSelector
        key="music"
        name="music"
        label="Music"
        showVolumes={true}
        onChange={jest.fn()}
      />,
    ],
    [
      'location',
      'Add location',
      <TikTokLocationSelector
        key="location"
        name="location"
        label="Location"
        onChange={jest.fn()}
      />,
    ],
  ])(
    'types the %s search at 16px on a touch screen, 14px with a mouse',
    async (_name, label, element) => {
      const search = await openSearch(await render(element), label);

      expect(search).toBeTruthy();
      expect(search!.className.split(' ')).toEqual(
        expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
      );
    }
  );
});
