'use client';

import { FC, ReactNode } from 'react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { HTML5toTouch } from 'rdndmb-html5-to-touch';
import { DndProvider, MultiBackendOptions } from 'react-dnd-multi-backend';

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
        options: {
          ...(step.options as object),
          delayTouchStart: TOUCH_HOLD_MS,
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
