import { act } from 'react';
import { createRoot } from 'react-dom/client';

// Spec 057 (contracts/ui.md "TilePicture", research R8). The file inside a
// media library tile: the small tile image when the storage made one, the
// original when it didn't or when the tile image fails, and for a video a still
// with a play badge that never falls back to loading the video. The whole file
// shows, letterboxed on the recess, and no tile shows a length.

// A visible mark, so a case can tell the hook's answer from the bare path.
jest.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => `directory:${path}` }),
}));
// The frame reports a length the way a real video's metadata would, so a tile
// that showed one would show it here.
jest.mock('@gitroom/react/helpers/video.frame', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    VideoFrame: (props: {
      url: string;
      className?: string;
      onLoadedMetadata?: (video: HTMLVideoElement) => void;
    }) => {
      useEffect(() => {
        props.onLoadedMetadata?.({ duration: 75 } as HTMLVideoElement);
      }, []);
      return (
        <span data-frame="" data-url={props.url} className={props.className} />
      );
    },
  };
});

import { TilePicture } from '@gitroom/frontend/components/media/media.library';

const image = { path: 'https://uploads/a.png' };
const imageWithTile = {
  path: 'https://uploads/a.png',
  tileImage: 'https://uploads/cdn-cgi/image/width=400/a.png',
};
const video = { path: 'https://uploads/b.mp4' };
const videoWithTile = {
  path: 'https://uploads/b.mp4',
  tileImage: 'https://uploads/cdn-cgi/media/mode=frame,width=400/b.mp4',
};

const roots: Array<{ unmount: () => void }> = [];

const render = (
  media: { path: string; tileImage?: string },
  corner?: 'start' | 'end'
) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(<TilePicture media={media} name="Beach day" corner={corner} />);
  });
  return host;
};

const fail = (element: Element) => {
  act(() => {
    element.dispatchEvent(new Event('error'));
  });
};

const badge = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('div')).find((node) =>
    node.classList.contains('bg-black/60')
  );

afterEach(() => {
  act(() => {
    roots.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('TilePicture', () => {
  it('draws an image from its tile image, whole, lazily, named by the name given', () => {
    const host = render(imageWithTile);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(imageWithTile.tileImage);
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].classList.contains('w-full')).toBe(true);
    expect(images[0].classList.contains('h-full')).toBe(true);
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[0].getAttribute('decoding')).toBe('async');
    expect(images[0].getAttribute('alt')).toBe('Beach day');
    expect(badge(host)).toBeUndefined();
  });

  it('shows the original when the tile image fails, and stays on it when that fails too', () => {
    const host = render(imageWithTile);
    const original = 'directory:https://uploads/a.png';

    fail(host.querySelector('img')!);
    expect(host.querySelector('img')!.getAttribute('src')).toBe(original);

    fail(host.querySelector('img')!);
    expect(host.querySelectorAll('img')).toHaveLength(1);
    expect(host.querySelector('img')!.getAttribute('src')).toBe(original);
  });

  it('draws an image without a tile image from the original, as today', () => {
    const host = render(image);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(
      'directory:https://uploads/a.png'
    );
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].getAttribute('alt')).toBe('Beach day');
  });

  it('draws a video with a tile image as its still and the play badge, and no video', () => {
    const host = render(videoWithTile);
    const images = host.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(videoWithTile.tileImage);
    expect(images[0].classList.contains('object-contain')).toBe(true);
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[0].getAttribute('decoding')).toBe('async');
    expect(images[0].getAttribute('alt')).toBe('Beach day');
    expect(badge(host)).toBeDefined();
    expect(host.querySelector('video')).toBeNull();
    expect(host.querySelector('[data-frame]')).toBeNull();
  });

  it('swaps a failed still for the neutral placeholder with the play badge, never a video', () => {
    const host = render(videoWithTile);

    fail(host.querySelector('img')!);

    const placeholder = host.querySelector('[role="img"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder!.getAttribute('aria-label')).toBe('Beach day');
    expect(host.querySelector('img')).toBeNull();
    expect(badge(host)).toBeDefined();
    expect(host.querySelector('video')).toBeNull();
    expect(host.querySelector('[data-frame]')).toBeNull();
  });

  it('draws a video without a tile image with its frame from the original, whole, with the play badge', () => {
    const host = render(video);
    const frame = host.querySelector('[data-frame]');

    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('data-url')).toBe(
      'directory:https://uploads/b.mp4'
    );
    expect(frame!.classList.contains('object-contain')).toBe(true);
    expect(frame!.classList.contains('object-cover')).toBe(false);
    expect(host.querySelector('img')).toBeNull();
    expect(badge(host)).toBeDefined();
  });

  it('shows no length on any tile', () => {
    const still = render(videoWithTile);
    const frame = render(video);
    const placeholder = render(videoWithTile);
    fail(placeholder.querySelector('img')!);

    [still, frame, placeholder].forEach((host) => {
      expect(host.textContent).not.toMatch(/\d+:\d\d/);
    });
  });

  it('puts the play badge over the file in the start corner by default, hidden from assistive technology', () => {
    const host = render(video);
    const play = badge(host)!;

    expect(play.getAttribute('aria-hidden')).toBe('true');
    expect(play.classList.contains('text-white')).toBe(true);
    expect(play.classList.contains('h-[20px]')).toBe(true);
    expect(play.classList.contains('top-[6px]')).toBe(true);
    expect(play.classList.contains('start-[6px]')).toBe(true);
    expect(play.classList.contains('end-[6px]')).toBe(false);
    expect(play.querySelector('svg')).not.toBeNull();
  });

  it('puts the play badge in the end corner when the caller gives it', () => {
    const play = badge(render(video, 'end'))!;

    expect(play.classList.contains('top-[6px]')).toBe(true);
    expect(play.classList.contains('end-[6px]')).toBe(true);
    expect(play.classList.contains('start-[6px]')).toBe(false);
  });

  it('sits in a square on the recess', () => {
    [image, imageWithTile, video, videoWithTile].forEach((media) => {
      const square = render(media).firstElementChild!;

      expect(square.classList.contains('bg-panel')).toBe(true);
      expect(square.classList.contains('w-full')).toBe(true);
      expect(square.classList.contains('h-full')).toBe(true);
    });
  });

  it('never draws the cover a row carries in thumbnail', () => {
    const cover = 'https://uploads/cover.jpg';
    const hosts = [image, imageWithTile, video, videoWithTile].map((media) =>
      render({ ...media, thumbnail: cover } as typeof media)
    );
    fail(hosts[1].querySelector('img')!);
    fail(hosts[3].querySelector('img')!);

    hosts.forEach((host) => {
      expect(host.innerHTML).not.toContain('cover.jpg');
    });
  });
});
