import { act, ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

// This config maps no @gitroom/helpers path, so the extension check is loaded
// from its source as a virtual module.
jest.mock(
  '@gitroom/helpers/utils/has.extension',
  () => jest.requireActual('../../../helpers/src/utils/has.extension'),
  { virtual: true }
);

// The placeholder's words, by key and English default.
const mockT = jest.fn((_key: string, fallback: string) => fallback);
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));

import {
  VideoOrImage,
  isPendingMediaPath,
  pendingMediaPath,
  pendingPreviewMedia,
} from './video.or.image';

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

/** Mounts the media inside a link, as a preview may wrap it. */
const mountInLink = async (src: string) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <a href="/p/1">
        <VideoOrImage src={src} autoplay={false} />
      </a>
    );
  });
  return host;
};

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  mockT.mockClear();
});

// A result still being made for the post stands in its preview under a path
// that names its kind (spec 061, FR-024).
describe('pending media paths', () => {
  it('marks a pending image or video with its kind', () => {
    expect(pendingMediaPath('image')).toBe('pending:image');
    expect(pendingMediaPath('video')).toBe('pending:video');
  });

  it('reads the kind back from a pending path', () => {
    expect(isPendingMediaPath('pending:image')).toBe('image');
    expect(isPendingMediaPath('pending:video')).toBe('video');
  });

  it.each(['/a.png', '/a.mp4', 'pending:', 'pending:audio'])(
    'reads no kind from %s',
    (path) => {
      expect(isPendingMediaPath(path)).toBeUndefined();
    }
  );

  it('makes a pending entry the media its preview holds: its id, and its kind as the path', () => {
    expect(pendingPreviewMedia({ id: 'r-1', kind: 'video' })).toEqual({
      id: 'r-1',
      path: 'pending:video',
    });
  });
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

  // The public preview page renders VideoOrImage as a server component, whose
  // renderer refuses a function prop on an element (a 500 for every post with
  // media): without onShape there is no handler to pass.
  it.each([
    ['an image', '/a.png', 'img', 'onLoad'],
    ['a video', '/a.mp4', 'video', 'onLoadedMetadata'],
  ])(
    'gives %s no load handler without onShape',
    (_name, src, type, handler) => {
      const element = VideoOrImage({ src, autoplay: false }) as ReactElement<
        Record<string, unknown>
      >;

      expect(element.type).toBe(type);
      expect(element.props[handler]).toBeUndefined();
    }
  );

  // While a result is being made, the preview shows a placeholder where it
  // will go, and loads nothing from the pending path.
  it.each([
    ['image', 'pending:image', 'creating_your_image', 'Creating your image…'],
    ['video', 'pending:video', 'creating_your_video', 'Creating your video…'],
  ])(
    'draws a pending %s as a busy box filling its container, with a spinner and its words',
    async (_kind, src, key, words) => {
      const host = await mountInLink(src);
      const box = host.querySelector('[aria-busy="true"]');

      expect(box).not.toBeNull();
      expect(box?.classList).toContain('w-full');
      expect(box?.classList).toContain('h-full');
      expect(box?.classList).toContain('bg-surface2');
      expect(box?.classList).toContain('motion-safe:animate-pulse');
      expect(
        box?.querySelector('[class~="motion-safe:animate-spin"]')
      ).not.toBeNull();
      expect(box?.textContent).toBe(words);
      expect(mockT).toHaveBeenCalledWith(key, words);
      expect(host.querySelectorAll('img, video')).toHaveLength(0);
    }
  );

  it('keeps a click on a pending placeholder from following the link around it', async () => {
    const host = await mountInLink('pending:image');
    const box = host.querySelector('[aria-busy="true"]');
    expect(box).not.toBeNull();

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    await act(async () => {
      box?.dispatchEvent(click);
    });

    expect(click.defaultPrevented).toBe(true);
  });
});
