import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// The composer's preview column draws each post at a phone's width and
// scales it down until the whole post fits the column's height, never under
// 0.7: below that the column scrolls (FR-028, FR-029). At 1025px and below
// the preview is today's, full width and unscaled, and the boxes around it
// never change, so the provider forms inside are never mounted again (D1).
import { MOBILE_QUERY } from '@gitroom/react/helpers/use.media.query';
import {
  fitScale,
  PREVIEW_MIN_SCALE,
  PREVIEW_PHONE_WIDTH,
  PreviewFit,
} from '@gitroom/frontend/components/new-launch/preview.fit';

// The sizes the browser reports: the column's height and the post's height
// at phone width.
const size = { room: 0, natural: 0 };

// Every observer the fit starts, with what it watches, so a case can report
// a resize as the browser would.
const observers: RecordingObserver[] = [];
class RecordingObserver {
  targets = new Set<Element>();
  constructor(public callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
}
Object.assign(global, { ResizeObserver: RecordingObserver });

const resizeTo = async (room: number, natural: number) => {
  size.room = room;
  size.natural = natural;
  await act(async () => {
    observers.forEach((observer) =>
      observer.callback(
        [...observer.targets].map(
          (target) => ({ target } as unknown as ResizeObserverEntry)
        ),
        observer as unknown as ResizeObserver
      )
    );
  });
};
const watched = () =>
  new Set(observers.flatMap((observer) => [...observer.targets]));

// The window, as the media query reports it: wider than 1025px unless a case
// narrows it, telling the listeners as a browser does.
const realMatchMedia = window.matchMedia;
let smallWindow = false;
const mediaListeners = new Set<() => void>();
const narrow = async () => {
  smallWindow = true;
  await act(async () => {
    mediaListeners.forEach((listener) => listener());
  });
};

beforeEach(() => {
  size.room = 0;
  size.natural = 0;
  observers.length = 0;
  smallWindow = false;
  mediaListeners.clear();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return smallWindow && query === MOBILE_QUERY;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) =>
      mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
});

const mounted: Array<{ unmount: () => void }> = [];

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  window.matchMedia = realMatchMedia;
});

// The post the fit holds, counting how often it is mounted.
let mounts = 0;
const Post = () => {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <p data-post />;
};

// The fit around a post, and its three boxes found from the post outwards:
// the content box drawn at phone width, the sizer that takes the scaled size,
// and the room, the column's height.
const render = async () => {
  mounts = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <PreviewFit>
        <Post />
      </PreviewFit>
    );
  });
  const post = host.querySelector('[data-post]') as HTMLElement;
  const content = post.parentElement as HTMLElement;
  const sizer = content.parentElement as HTMLElement;
  const room = sizer.parentElement as HTMLElement;
  Object.defineProperty(room, 'clientHeight', {
    configurable: true,
    get: () => size.room,
  });
  Object.defineProperty(content, 'offsetHeight', {
    configurable: true,
    get: () => size.natural,
  });
  return { host, post, content, sizer, room };
};

const scaleOf = (box: HTMLElement) =>
  Number(/^scale\((.+)\)$/.exec(box.style.transform)?.[1]);

// Boxes left as today's preview: no size, no transform and none of them
// positioned, so a preview that fills its container fills the column, not a
// box with no height.
const expectInFlow = (boxes: HTMLElement[]) =>
  boxes.forEach((box) => {
    expect(box.style.width).toBe('');
    expect(box.style.minHeight).toBe('');
    expect(box.style.height).toBe('');
    expect(box.style.transform).toBe('');
    expect(
      ['relative', 'absolute', 'top-0', 'start-0'].filter((name) =>
        box.classList.contains(name)
      )
    ).toEqual([]);
  });

describe('fitScale', () => {
  it('draws at a phone width of 360px and scales no lower than 0.7', () => {
    expect(PREVIEW_PHONE_WIDTH).toBe(360);
    expect(PREVIEW_MIN_SCALE).toBe(0.7);
  });

  it.each([
    // part 1's room at 1440×900: the post fits as it is
    [631, 620, 1],
    // part 1's room at 1280×720
    [451, 620, 0.7274],
    // below the floor the post keeps 0.7 and the column scrolls
    [300, 620, 0.7],
    // a hidden column, or the first paint before anything is measured
    [0, 620, 1],
    [500, 0, 1],
  ])('a room of %ipx for a post %ipx tall scales by %f', (room, natural, s) => {
    expect(fitScale(room, natural)).toBeCloseTo(s, 4);
  });
});

describe('PreviewFit', () => {
  it('draws the post at 360px and scales it to the room', async () => {
    const { content, sizer, room } = await render();
    await resizeTo(451, 620);

    expect(watched()).toEqual(new Set([room, content]));
    expect(content.style.width).toBe('360px');
    expect(content.style.minHeight).toBe('451px');
    expect(scaleOf(content)).toBeCloseTo(451 / 620, 6);
    [
      'absolute',
      'top-0',
      'start-0',
      'origin-top-left',
      'rtl:origin-top-right',
    ].forEach((name) => expect(content.classList.contains(name)).toBe(true));
    expect(sizer.classList.contains('relative')).toBe(true);
    expect(sizer.classList.contains('mx-auto')).toBe(true);
    expect(sizer.style.width).toMatch(/px$/);
    expect(parseFloat(sizer.style.width)).toBeCloseTo(261.9, 1);
    expect(sizer.style.height).toMatch(/px$/);
    expect(parseFloat(sizer.style.height)).toBeCloseTo(451, 3);
  });

  it('keeps 0.7 below the floor, the sizer taller than the room', async () => {
    const { content, sizer } = await render();
    await resizeTo(300, 620);

    expect(scaleOf(content)).toBeCloseTo(0.7, 6);
    expect(content.style.minHeight).toBe('300px');
    expect(parseFloat(sizer.style.height)).toBeCloseTo(434, 3);
    expect(parseFloat(sizer.style.height)).toBeGreaterThan(300);
  });

  it('at 1025px and below leaves the post full width, in the flow', async () => {
    smallWindow = true;
    const { content, sizer, room } = await render();
    await resizeTo(451, 620);

    expectInFlow([room, sizer, content]);
  });

  it('with a room of 0, before it is measured, leaves the post in the flow', async () => {
    const { content, sizer, room } = await render();
    await resizeTo(0, 620);

    expectInFlow([room, sizer, content]);
    expect(sizer.classList.contains('mx-auto')).toBe(true);
  });

  it('never mounts the post again, as it resizes or the window narrows', async () => {
    const { host, post } = await render();
    await resizeTo(631, 620);
    await resizeTo(451, 620);
    await resizeTo(300, 620);
    expect(mounts).toBe(1);

    await narrow();
    expect(mounts).toBe(1);
    expect(host.querySelector('[data-post]')).toBe(post);
  });
});
