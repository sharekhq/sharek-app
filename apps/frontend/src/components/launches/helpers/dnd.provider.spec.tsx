// Upstream's calendar backend stops it cancelling native drags that start in the
// post editor, so text and pictures can be dragged inside a post again. Upstream
// hands DndProvider that backend alone, which is HTML5 only: on Sharek it would
// end touch dragging on phones and iPads. The merge keeps Sharek's HTML5toTouch
// pipeline and puts upstream's filter on its html5 step only.
//
// What is pinned here is that graft: both steps survive, the touch step is the
// library's own, and the html5 step drops a drag from inside an editable node
// and passes every other one through.
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

jest.mock('rdndmb-html5-to-touch', () => ({
  HTML5toTouch: {
    backends: [
      {
        id: 'html5',
        backend: (): null => null,
        transition: { event: 'pointerdown', check: (): boolean => false },
      },
      {
        id: 'touch',
        backend: (): null => null,
        options: { enableMouseEvents: true },
        preview: true,
        transition: { event: 'touchstart', check: (): boolean => true },
      },
    ],
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
  it('keeps the html5 and touch steps, the touch step being the library’s own', async () => {
    const options = await pipeline();
    expect(options.backends.map((step) => step.id)).toEqual([
      'html5',
      'touch',
    ]);
    expect(options.backends[1]).toBe(HTML5toTouch.backends[1]);
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
