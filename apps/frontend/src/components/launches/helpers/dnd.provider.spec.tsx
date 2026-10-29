// Upstream's calendar backend stops it cancelling native drags that start in the
// post editor, so text and pictures can be dragged inside a post again. Upstream
// hands DndProvider that backend alone, which is HTML5 only: on Sharek it would
// end touch dragging on phones and iPads. The merge keeps Sharek's HTML5toTouch
// pipeline and puts upstream's filter on its html5 step only.
//
// What is pinned here is that graft: both steps survive with the library's
// transitions, and the html5 step drops a drag from inside an editable node
// and passes every other one through.
//
// The touch step also waits for a hold before it picks anything up. Without
// it, a swipe that started on a channel in the Channels sheet dragged the
// channel, and letting go over a customer moved it there on the server; a
// swipe across Week could do the same to a post. A tap left the library's
// hold armed, so a swipe straight after one dragged too; the touch step's
// backend is wrapped to clear it. The library's real pipeline and touch
// backend run here, so the hold is pinned as a finger meets it.
import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  MultiBackendOptions,
  MultiBackendPipelineStep,
} from 'react-dnd-multi-backend';

const received: MultiBackendOptions[] = [];
jest.mock('react-dnd-multi-backend', () => ({
  DndProvider: (props: {
    options: MultiBackendOptions;
    children: ReactNode;
  }) => {
    received.push(props.options);
    return props.children;
  },
}));

type HandlerName = 'handleTopDragStart' | 'handleTopDragOver' | 'handleTopDrop';

// The handlers the real backend registers on the window, as spies. Kept apart
// from the instance, because the calendar backend wraps them in place on it.
let original: Record<HandlerName, jest.Mock>;
jest.mock('react-dnd-html5-backend', () => ({
  HTML5Backend: () => {
    original = {
      handleTopDragStart: jest.fn(),
      handleTopDragOver: jest.fn(),
      handleTopDrop: jest.fn(),
    };
    return { ...original };
  },
}));

import { HTML5toTouch } from 'rdndmb-html5-to-touch';
import { DNDProvider } from './dnd.provider';

const dragFrom = (editable: boolean) =>
  ({
    composedPath: () => [{ isContentEditable: editable }, {}],
  } as unknown as DragEvent);

// The html5 step's backend, built the way the multi-backend builds it.
const html5Backend = (options: MultiBackendOptions) =>
  options.backends[0].backend(
    {} as unknown as Parameters<MultiBackendPipelineStep['backend']>[0]
  ) as unknown as Record<HandlerName, (event: DragEvent) => void>;

const mounted: Array<{ unmount: () => void }> = [];

const pipeline = async () => {
  received.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(<DNDProvider>calendar</DNDProvider>);
  });
  return received[0];
};

afterEach(() => {
  mounted.splice(0).forEach((root) => act(() => root.unmount()));
});

describe('DNDProvider', () => {
  // The touch step's backend is the library's, wrapped so a tap leaves no hold
  // armed; the finger tests below run the library's backend through it.
  it('keeps the html5 and touch steps, the touch step’s transition and preview the library’s own', async () => {
    const options = await pipeline();
    expect(options.backends.map((step) => step.id)).toEqual([
      'html5',
      'touch',
    ]);
    const [touch, library] = [options.backends[1], HTML5toTouch.backends[1]];
    expect(touch.transition).toBe(library.transition);
    expect(touch.preview).toBe(library.preview);
  });

  it('keeps the touch step’s mouse events and adds a 400ms hold for a finger only', async () => {
    const options = await pipeline();
    // `delay` or `delayMouseStart` would hold a mouse up too; a context menu
    // no longer ends the touch (see the finger tests below)
    expect(options.backends[1].options).toEqual({
      enableMouseEvents: true,
      delayTouchStart: 400,
      ignoreContextMenu: true,
    });
  });

  it('keeps the html5 step’s transition', async () => {
    const options = await pipeline();
    expect(options.backends[0].transition).toBe(
      HTML5toTouch.backends[0].transition
    );
  });

  it('drops a drag that starts inside an editable node', async () => {
    const options = await pipeline();
    const backend = html5Backend(options);
    backend.handleTopDrop(dragFrom(true));
    backend.handleTopDragStart(dragFrom(true));
    expect(original.handleTopDrop).not.toHaveBeenCalled();
    expect(original.handleTopDragStart).not.toHaveBeenCalled();
  });

  it('passes any other drag to the original handler once', async () => {
    const options = await pipeline();
    const backend = html5Backend(options);
    const event = dragFrom(false);
    backend.handleTopDragOver(event);
    expect(original.handleTopDragOver).toHaveBeenCalledTimes(1);
    expect(original.handleTopDragOver).toHaveBeenCalledWith(event);
  });
});

// The touch step's backend, built the way the multi-backend builds it, with a
// manager that records what the drag does: it begins, follows the finger
// (hover), and ends with or without a drop.
const touchBackend = (options: MultiBackendOptions, id = 'channel') => {
  let dragging = false;
  const actions = {
    beginDrag: jest.fn(() => {
      dragging = true;
    }),
    publishDragSource: jest.fn(),
    hover: jest.fn(),
    drop: jest.fn(),
    endDrag: jest.fn(() => {
      dragging = false;
    }),
  };
  const manager = {
    getActions: () => actions,
    getMonitor: () => ({
      isDragging: () => dragging,
      didDrop: () => false,
      getSourceId: () => id,
    }),
  } as unknown as Parameters<MultiBackendPipelineStep['backend']>[0];
  const step = options.backends[1];
  const backend = step.backend(manager, window, step.options);
  backend.setup();
  mounted.push({ unmount: () => backend.teardown() });
  const source = document.createElement('div');
  document.body.appendChild(source);
  backend.connectDragSource(id, source);
  return { actions, backend, beginDrag: actions.beginDrag, source };
};

// Chrome on Android fires it on a long press, a right-click anywhere
const contextMenu = (target: HTMLElement, buttons = 0) => {
  const event = new window.MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    buttons,
  });
  target.dispatchEvent(event);
  return event;
};

const touch = (
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  target: HTMLElement,
  clientY: number
) => {
  const point = new window.Touch({
    identifier: 1,
    target,
    clientX: 20,
    clientY,
  });
  // a finger that lifts or is cancelled is no longer on the screen
  const down = type === 'touchstart' || type === 'touchmove' ? [point] : [];
  target.dispatchEvent(
    new window.TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: down,
      targetTouches: down,
      changedTouches: [point],
    })
  );
};

describe('a finger on a draggable row or card', () => {
  beforeAll(() => {
    // what a drag under way reaches for: happy-dom has no elementsFromPoint,
    // and Jest's node environment no MutationObserver
    document.elementsFromPoint = () => [];
    Object.assign(globalThis, { MutationObserver: window.MutationObserver });
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('scrolls when it moves before the hold ends, and never starts a drag', async () => {
    const { beginDrag, source } = touchBackend(await pipeline());
    touch('touchstart', source, 100);
    jest.advanceTimersByTime(50);
    touch('touchmove', source, 140);
    jest.advanceTimersByTime(1000);
    touch('touchmove', source, 260);
    expect(beginDrag).not.toHaveBeenCalled();
  });

  // Flick, tap to stop, flick again: how a list is scrolled on an iPhone.
  it('scrolls when a swipe follows a tap within the hold, and never starts a drag', async () => {
    const { beginDrag, source } = touchBackend(await pipeline());
    touch('touchstart', source, 100);
    touch('touchend', source, 100);
    jest.advanceTimersByTime(200);
    touch('touchstart', source, 300);
    jest.advanceTimersByTime(30);
    touch('touchmove', source, 260);
    jest.advanceTimersByTime(400);
    touch('touchmove', source, 140);
    expect(beginDrag).not.toHaveBeenCalled();
  });

  it('leaves no hold armed after a touch the system cancels', async () => {
    const { beginDrag, source } = touchBackend(await pipeline());
    touch('touchstart', source, 100);
    jest.advanceTimersByTime(100);
    touch('touchcancel', source, 100);
    jest.advanceTimersByTime(1000);
    // an iPad pointer hovering afterwards reaches the touch step as a mouse
    source.dispatchEvent(
      new window.MouseEvent('mousemove', {
        bubbles: true,
        clientX: 20,
        clientY: 200,
      })
    );
    expect(beginDrag).not.toHaveBeenCalled();
  });

  // A mouse makes the multi-backend tear the touch step down; the next touch
  // sets it up again and re-dispatches that touchstart. The library's teardown
  // leaves its touchstart listener behind (TouchBackendImpl.ts:180), so that
  // touch arms the hold twice.
  it('scrolls on an iPad that went from a mouse back to a finger', async () => {
    const { backend, beginDrag, source } = touchBackend(await pipeline());
    backend.teardown();
    touch('touchstart', source, 100);
    backend.setup();
    touch('touchstart', source, 100);
    jest.advanceTimersByTime(30);
    touch('touchmove', source, 140);
    jest.advanceTimersByTime(400);
    touch('touchmove', source, 200);
    expect(beginDrag).not.toHaveBeenCalled();
  });

  it('picks the row up when it is held for 400ms, then moves', async () => {
    const { beginDrag, source } = touchBackend(await pipeline());
    touch('touchstart', source, 100);
    jest.advanceTimersByTime(400);
    touch('touchmove', source, 140);
    expect(beginDrag).toHaveBeenCalledTimes(1);
    expect(beginDrag).toHaveBeenCalledWith(['channel'], expect.anything());
  });

  // Chrome on Android fires contextmenu at its long press, about when the
  // hold completes; the library ended the drag on it, so only a move started
  // between the two picked anything up.
  it.each(['channel', 'post'])(
    'picks a %s up after any hold of 400ms or more, through the long press’s menu',
    async (id) => {
      const { actions, source } = touchBackend(await pipeline(), id);
      touch('touchstart', source, 100);
      jest.advanceTimersByTime(500);
      const menu = contextMenu(source);
      jest.advanceTimersByTime(500);
      touch('touchmove', source, 140);
      expect(actions.beginDrag).toHaveBeenCalledTimes(1);
      expect(actions.beginDrag).toHaveBeenCalledWith([id], expect.anything());
      expect(actions.hover).toHaveBeenLastCalledWith([], {
        clientOffset: { x: 20, y: 140 },
      });
      // and Android opens no image or text menu over the row or the card
      expect(menu.defaultPrevented).toBe(true);
    }
  );

  it('keeps a drag under way through a context menu, and drops nothing', async () => {
    const { actions, source } = touchBackend(await pipeline());
    touch('touchstart', source, 100);
    jest.advanceTimersByTime(400);
    touch('touchmove', source, 140);
    const menu = contextMenu(source);
    touch('touchmove', source, 200);
    expect(actions.drop).not.toHaveBeenCalled();
    expect(actions.endDrag).not.toHaveBeenCalled();
    expect(actions.hover).toHaveBeenLastCalledWith([], {
      clientOffset: { x: 20, y: 200 },
    });
    expect(menu.defaultPrevented).toBe(true);
  });

  it('keeps every other context menu: a right-click, a long press on what is not draggable, one after the finger lifts', async () => {
    const { source } = touchBackend(await pipeline());
    expect(contextMenu(source, 2).defaultPrevented).toBe(false);

    const picture = document.createElement('img');
    document.body.appendChild(picture);
    touch('touchstart', picture, 100);
    jest.advanceTimersByTime(500);
    expect(contextMenu(picture).defaultPrevented).toBe(false);
    touch('touchend', picture, 100);

    touch('touchstart', source, 100);
    touch('touchend', source, 100);
    expect(contextMenu(source).defaultPrevented).toBe(false);
  });
});
