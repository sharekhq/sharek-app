import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Instagram's preview draws the post's media in the shape it will post in: the
// first slide's own shape, held to the range Instagram keeps a feed post in
// (4:5 portrait up to 1.91:1 landscape), where it used to be a box fixed at
// 585px tall. The preview reads its post and channel from the real
// IntegrationContext.

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
import {
  clampInstagram,
  InstagramPreview,
} from '@gitroom/frontend/components/new-launch/providers/instagram/instagram.preview';

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

const channel = {
  id: 'int-1',
  name: 'Sharek Café',
  display: 'sharek.cafe',
  identifier: 'instagram',
  picture: 'https://media.sharek.app/int-1.png',
};

const IMAGE = 'https://media.sharek.app/a.png';
const SECOND_IMAGE = 'https://media.sharek.app/b.png';
const VIDEO = 'https://media.sharek.app/a.mp4';

/** Mounts Instagram's preview of a post that carries these media files. */
const showPreview = async (paths: string[]) => {
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
          integration: channel as any,
          value: [
            {
              id: 'v1',
              content: '<p>Hi</p>',
              image: paths.map((path, index) => ({ id: `m${index}`, path })),
            },
          ],
        }}
      >
        <InstagramPreview />
      </IntegrationContext.Provider>
    );
  });
  return host;
};

/** The slide on show: its image or video, inside the link to the file. */
const slide = (host: HTMLElement) =>
  host.querySelector<HTMLElement>('a > img, a > video')!;

/** Gives the slide on show an intrinsic size and fires the event that reports it. */
const load = async (
  host: HTMLElement,
  event: string,
  size: Record<string, number>
) => {
  const media = slide(host);
  for (const [key, value] of Object.entries(size)) {
    Object.defineProperty(media, key, { value, configurable: true });
  }
  await act(async () => {
    media.dispatchEvent(new Event(event));
  });
};

/** The shape the slider is drawn at: the --ig-ratio an ancestor of it sets. */
const boxRatio = (host: HTMLElement) => {
  const box = slide(host).closest<HTMLElement>('[style*="--ig-ratio"]');
  expect(box).not.toBeNull();
  return Number(box!.style.getPropertyValue('--ig-ratio'));
};

describe("Instagram preview's media shape", () => {
  it('draws a one-image post square before the image loads', async () => {
    const host = await showPreview([IMAGE]);

    expect(boxRatio(host)).toBe(1);
  });

  it.each([
    [1080, 1350, 0.8],
    [1080, 1920, 0.8],
    [1920, 1080, 1.7778],
    [3000, 1000, 1.91],
  ])(
    'draws an image of %s by %s at %s once it loads',
    async (naturalWidth, naturalHeight, ratio) => {
      const host = await showPreview([IMAGE]);
      await load(host, 'load', { naturalWidth, naturalHeight });

      expect(boxRatio(host)).toBeCloseTo(ratio, 4);
    }
  );

  it('draws a video of 1080 by 1920 at 0.8 once its metadata loads', async () => {
    const host = await showPreview([VIDEO]);
    await load(host, 'loadedmetadata', { videoWidth: 1080, videoHeight: 1920 });

    expect(boxRatio(host)).toBeCloseTo(0.8, 4);
  });

  it('draws the slider in the shape --ig-ratio holds, no longer 585px tall', async () => {
    const host = await showPreview([IMAGE]);
    const slider = slide(host).closest('a')!.parentElement!;

    expect(slider.classList.contains('aspect-[var(--ig-ratio)]')).toBe(true);
    expect(slider.classList.contains('h-[585px]')).toBe(false);
    expect(
      Array.from(host.querySelectorAll('*')).filter((element) =>
        element.classList.contains('h-[585px]')
      )
    ).toEqual([]);
  });

  it('keeps the image cropped to fill the box', async () => {
    const host = await showPreview([IMAGE]);

    expect(slide(host).classList.contains('object-cover')).toBe(true);
  });

  it("takes a two-image post's shape from its first image", async () => {
    const host = await showPreview([IMAGE, SECOND_IMAGE]);
    await load(host, 'load', { naturalWidth: 1080, naturalHeight: 1350 });
    await act(async () => {
      host
        .querySelector('[aria-label="Next slide"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(slide(host).getAttribute('src')).toBe(SECOND_IMAGE);
    await load(host, 'load', { naturalWidth: 1920, naturalHeight: 1080 });

    expect(boxRatio(host)).toBeCloseTo(0.8, 4);
  });
});

describe('clampInstagram', () => {
  it.each([
    [0.5, 0.8],
    [1, 1],
    [2.5, 1.91],
  ])('holds %s to %s', (ratio, clamped) => {
    expect(clampInstagram(ratio)).toBe(clamped);
  });
});
