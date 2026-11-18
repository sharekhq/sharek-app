import { act } from 'react';
import { createRoot } from 'react-dom/client';

// TikTok's preview: the like/comment/save/share rail sits over the video inside
// its end edge (right in LTR, left in RTL), the caption sits on a dark fade so
// it reads on bright media, and the preview never widens past its box.

// Scenery: the preview reads only which editor tab is open.
jest.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (select: (state: { current: string }) => unknown) =>
    select({ current: 'global' }),
}));

import dayjs from 'dayjs';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const showPreview = async () => {
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
            identifier: 'tiktok',
            picture: 'https://media.sharek.app/int-1.png',
          } as never,
          value: [{ id: 'v1', content: '<p>Hi</p>', image: [] }],
        }}
      >
        <TiktokPreview />
      </IntegrationContext.Provider>
    );
  });
  return host;
};

const classes = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[class]')).flatMap((el) =>
    Array.from(el.classList)
  );

describe('TiktokPreview', () => {
  it('the action rail uses end spacing', async () => {
    const host = await showPreview();
    const rail = host.querySelector<HTMLElement>('[data-tiktok-rail]')!;
    expect(rail).not.toBeNull();
    expect(Array.from(rail.classList).some((c) => /^end-/.test(c))).toBe(true);
    expect(classes(host).some((c) => /^-?ml-/.test(c))).toBe(false);
  });

  it('the caption sits on a fade', async () => {
    const host = await showPreview();
    const caption = host.querySelector<HTMLElement>('[data-tiktok-caption]')!;
    expect(caption.className).toMatch(/linear-gradient\(to_top,color-mix/);
  });

  it('the root never overflows sideways', async () => {
    const host = await showPreview();
    const root = host.firstElementChild as HTMLElement;
    expect(root.classList.contains('min-w-0')).toBe(true);
    expect(root.classList.contains('overflow-hidden')).toBe(true);
  });

  it('no physical left/right classes', async () => {
    const host = await showPreview();
    expect(
      classes(host).filter((c) =>
        /^-?(ml|mr|pl|pr|left|right|text-left|text-right|rounded-[lr])(-|$)/.test(
          c
        )
      )
    ).toEqual([]);
  });
});
