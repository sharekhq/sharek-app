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

// Upstream hands DndProvider CalendarBackend alone. Sharek keeps the
// HTML5toTouch pipeline, so a finger can still drag a post, and puts the
// editor filter on its html5 step only: the touch step never sees native drags.
const CALENDAR_PIPELINE: MultiBackendOptions = {
  backends: HTML5toTouch.backends.map((step) =>
    step.id === 'html5' ? { ...step, backend: CalendarBackend } : step
  ),
};

export const DNDProvider: FC<{
  children: ReactNode;
}> = ({ children }) => {
  // The HTML5toTouch pipeline registers both backends at once and switches on
  // the first touch event, so a finger can drag a post without asking what kind
  // of pointer this is before first paint, and without remounting the provider.
  return <DndProvider options={CALENDAR_PIPELINE}>{children}</DndProvider>;
};
