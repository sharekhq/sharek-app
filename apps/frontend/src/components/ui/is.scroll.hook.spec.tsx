import { act, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useHasScroll } from '@gitroom/frontend/components/ui/is.scroll.hook';

// The compose window's Scrollable columns add their end padding while
// useHasScroll says the box scrolls, and the hook checks again whenever the
// box's content changes. The Post preview's fit scales the post through
// inline styles alone, so a style change inside the box is a change of its
// content too: a post scaled to fit leaves the box with nothing to scroll
// (spec 061, FR-028). The test DOM has no layout, so the box reports the
// height its content takes; happy-dom delivers mutations on a timer, which
// each change waits for inside act.

let content = 0;
let hasScroll: boolean | undefined;
let box: HTMLElement;
let post: HTMLElement;
let root: Root;

// a host holding the hook's ref, as Scrollable does
const Probe = (): null => {
  const ref = useRef<HTMLElement>(box);
  hasScroll = useHasScroll(ref);
  return null;
};

const mount = (height: number) => {
  content = height;
  box = document.createElement('div');
  post = document.createElement('div');
  box.appendChild(post);
  document.body.appendChild(box);
  Object.defineProperty(box, 'scrollHeight', { get: () => content });
  Object.defineProperty(box, 'clientHeight', { value: 400 });
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<Probe />);
  });
};

// the box's content changes to the given height, its mutations delivered
const change = async (height: number, edit: () => void) => {
  await act(async () => {
    content = height;
    edit();
    await new Promise((resolve) => window.setTimeout(resolve));
  });
};

beforeAll(() => {
  // Jest's node environment has no MutationObserver
  Object.assign(globalThis, { MutationObserver: window.MutationObserver });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = '';
});

describe('useHasScroll', () => {
  it('turns false when a style change in a child makes the box fit', async () => {
    mount(600);
    expect(hasScroll).toBe(true);

    // the preview's fit scales the post down to the box's height
    await change(400, () => {
      post.style.transform = 'scale(0.7)';
    });

    expect(hasScroll).toBe(false);
  });

  it('turns true when a child added makes the box overflow', async () => {
    mount(400);
    expect(hasScroll).toBe(false);

    await change(800, () => {
      box.appendChild(document.createElement('div'));
    });

    expect(hasScroll).toBe(true);
  });
});
