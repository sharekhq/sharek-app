import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

// This config maps no @gitroom/helpers path, so the extension check is loaded
// from its source as a virtual module.
jest.mock(
  '@gitroom/helpers/utils/has.extension',
  () => jest.requireActual('../../../helpers/src/utils/has.extension'),
  { virtual: true }
);

import { VideoOrImage } from './video.or.image';

// Instagram's preview sizes its box to the first slide's shape, which the
// image reports on load and the video once its metadata is in. Without
// onShape the element renders exactly as before.
const IMAGE_MARKUP =
  '<link rel="preload" as="image" href="/a.png"/><img class="object-cover w-full h-full" src="/a.png"/>';
const VIDEO_MARKUP =
  '<video src="/a.mp4" class="w-full h-full" muted="" loop=""></video>';

const mounted: Array<{ unmount: () => void }> = [];

/** Mounts the media, gives it an intrinsic size and fires the event that reports it. */
const load = async (
  src: string,
  event: string,
  size: Record<string, number>,
  onShape: (ratio: number) => void
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<VideoOrImage src={src} autoplay={false} onShape={onShape} />);
  });
  const media = host.firstElementChild as HTMLElement;
  for (const [key, value] of Object.entries(size)) {
    Object.defineProperty(media, key, { value, configurable: true });
  }
  await act(async () => {
    media.dispatchEvent(new Event(event));
  });
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('VideoOrImage', () => {
  it('reports an image shape as width over height on load', async () => {
    const onShape = jest.fn();
    await load(
      '/a.png',
      'load',
      { naturalWidth: 1080, naturalHeight: 1350 },
      onShape
    );

    expect(onShape).toHaveBeenCalledTimes(1);
    expect(onShape).toHaveBeenCalledWith(0.8);
  });

  it('reports a video shape as width over height once its metadata loads', async () => {
    const onShape = jest.fn();
    await load(
      '/a.mp4',
      'loadedmetadata',
      { videoWidth: 1920, videoHeight: 1080 },
      onShape
    );

    expect(onShape).toHaveBeenCalledTimes(1);
    expect(onShape.mock.calls[0][0]).toBeCloseTo(1.7778, 4);
  });

  it.each([
    ['an image', '/a.png', 'load', { naturalWidth: 1080, naturalHeight: 0 }],
    [
      'a video',
      '/a.mp4',
      'loadedmetadata',
      { videoWidth: 1920, videoHeight: 0 },
    ],
  ])(
    'reports nothing for %s with a zero height',
    async (_name, src, event, size) => {
      const onShape = jest.fn();
      await load(src, event, size, onShape);

      expect(onShape).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['an image', '/a.png', IMAGE_MARKUP],
    ['a video', '/a.mp4', VIDEO_MARKUP],
  ])('renders %s as before without onShape', (_name, src, markup) => {
    expect(
      renderToStaticMarkup(<VideoOrImage src={src} autoplay={false} />)
    ).toBe(markup);
  });
});
