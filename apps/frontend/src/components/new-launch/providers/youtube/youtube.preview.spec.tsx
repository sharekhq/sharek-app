import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Scenery: the preview reads only which editor tab is open.
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: any) => any) =>
    select({ current: 'global' }),
}));
// Scenery: the English fallbacks stand in for the locale files.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}));

import dayjs from 'dayjs';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('YoutubePreview', () => {
  it('uses end margins and start anchor', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <IntegrationContext.Provider
          value={{
            date: dayjs(),
            allIntegrations: [],
            integration: {
              id: 'int-1',
              name: 'Sharek',
              identifier: 'youtube',
              picture: 'https://media.sharek.app/int-1.png',
            } as any,
            value: [{ id: 'v1', content: '<p>Hi</p>', image: [] }],
          }}
        >
          <YoutubePreview />
        </IntegrationContext.Provider>
      );
    });
    const all = Array.from(host.querySelectorAll('[class]')).flatMap((el) =>
      Array.from(el.classList)
    );
    expect(all.filter((c) => /^-?(ml|mr|left|right)-/.test(c))).toEqual([]);
    expect(all.some((c) => /^me-\[/.test(c))).toBe(true);
    expect(all).toContain('start-0');
  });
});
