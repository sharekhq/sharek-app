'use client';

import { FC, ReactNode } from 'react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { HTML5toTouch } from 'rdndmb-html5-to-touch';
import {
  DndProvider,
  MultiBackendOptions,
  MultiBackendPipelineStep,
} from 'react-dnd-multi-backend';

const DRAG_HANDLERS = [
  'handleTopDragStart',
  'handleTopDragStartCapture',
  'handleTopDragEndCapture',
  'handleTopDragEnter',
  'handleTopDragEnterCapture',
  'handleTopDragLeaveCapture',
  'handleTopDragOver',
  'handleTopDragOverCapture',
  'handleTopDrop',
  'handleTopDropCapture',
];

// the path is kept from the start of the dispatch, the editor can re-render
// the target out of the page before the event bubbles up to the window
const isInsideEditor = (event: Event) =>
  event
    .composedPath()
    .some((node) => (node as HTMLElement).isContentEditable);

// the backend listens to every drag on the window and cancels the native drops
// it doesn't own, so dragging text or pictures inside the post editor did nothing
const CalendarBackend: typeof HTML5Backend = (manager, context, options) => {
  const backend = HTML5Backend(manager, context, options) as any;
  for (const name of DRAG_HANDLERS) {
    const handler = backend[name];
    if (typeof handler !== 'function') {
      continue;
    }

    backend[name] = (event: DragEvent) => {
      if (!isInsideEditor(event)) {
        handler(event);
      }
    };
  }

  return backend;
};

// A finger picks a channel or a post up only after resting on it this long.
// A swipe moves sooner, which cancels the hold, so the sheet or the week
// scrolls instead of the row being dragged and dropped somewhere else.
const TOUCH_HOLD_MS = 400;

// react-dnd-touch-backend 16.0.1 arms one timer per touchstart and keeps a
// single handle to it (TouchBackendImpl.ts:382-396); only a move clears it
// (:411-416). A tap leaves its timer pending, the next touchstart overwrites
// the handle (:391), and when the tap's timer fires mid-swipe the swipe drags:
// flick, tap to stop, flick again. So the timer is cleared before a touchstart
// arms its own, when a touch ends (:562), and on touchcancel, which the
// backend never listens for (:35-39).
//
// Chrome on Android fires contextmenu at its long press, about when the hold
// completes, and the backend ends the touch on it (:147-153, :562-582): a held
// finger forgets its row (:570-572), a drag under way drops where it is
// (:575-581). So the touch step ignores it (`ignoreContextMenu`), and the menu
// is cancelled while a finger is on a draggable (:338-352) or dragging, so
// Android opens no image or text menu over it. A right-click, or a long press
// on anything else, keeps its menu.
const HOLD_HANDLERS = [
  'handleTopMoveStartDelay',
  'handleTopMoveEndCapture',
] as const;

type TouchBackendInternals = Record<
  (typeof HOLD_HANDLERS)[number],
  (event: Event) => void
> & {
  timeout?: ReturnType<typeof setTimeout>;
  moveStartSourceIds?: unknown[];
  monitor: { isDragging: () => boolean };
  options: { rootElement?: Node };
  setup: () => void;
  teardown: () => void;
};

type BackendFactory = MultiBackendPipelineStep['backend'];

const withTouchHold =
  (touchBackend: BackendFactory): BackendFactory =>
  (manager, context, options) => {
    const instance = touchBackend(manager, context, options);
    const backend = instance as unknown as TouchBackendInternals;
    const clearHold = () => clearTimeout(backend.timeout);
    for (const name of HOLD_HANDLERS) {
      const handler = backend[name];
      if (typeof handler !== 'function') {
        continue;
      }

      backend[name] = (event: Event) => {
        clearHold();
        handler(event);
      };
    }

    const holdMenu = (event: Event) => {
      if (backend.monitor.isDragging() || backend.moveStartSourceIds?.length) {
        event.preventDefault();
      }
    };
    const listeners: Array<[string, EventListener]> = [
      ['touchcancel', clearHold],
      ['contextmenu', holdMenu],
    ];

    const { setup, teardown } = backend;
    backend.setup = () => {
      setup.call(backend);
      for (const [type, listener] of listeners) {
        backend.options.rootElement?.addEventListener(type, listener, true);
      }
    };
    backend.teardown = () => {
      teardown.call(backend);
      for (const [type, listener] of listeners) {
        backend.options.rootElement?.removeEventListener(type, listener, true);
      }
    };

    return instance;
  };

// Upstream hands DndProvider CalendarBackend alone. Sharek keeps the
// HTML5toTouch pipeline, so a finger can still drag a post, and puts the
// editor filter on its html5 step only: the touch step never sees native drags.
// The hold goes on the touch step only (`delayTouchStart`, not `delay`), so a
// mouse picks things up at once.
const CALENDAR_PIPELINE: MultiBackendOptions = {
  backends: HTML5toTouch.backends.map((step) => {
    if (step.id === 'html5') {
      return { ...step, backend: CalendarBackend };
    }

    if (step.id === 'touch') {
      return {
        ...step,
        backend: withTouchHold(step.backend),
        options: {
          ...(step.options as object),
          delayTouchStart: TOUCH_HOLD_MS,
          ignoreContextMenu: true,
        },
      };
    }

    return step;
  }),
};

export const DNDProvider: FC<{
  children: ReactNode;
}> = ({ children }) => {
  // The HTML5toTouch pipeline registers both backends at once and switches on
  // the first touch event, so a finger can drag a post without asking what kind
  // of pointer this is before first paint, and without remounting the provider.
  return <DndProvider options={CALENDAR_PIPELINE}>{children}</DndProvider>;
};
