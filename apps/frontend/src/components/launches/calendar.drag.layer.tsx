'use client';

import { FC, useCallback, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { State } from '@prisma/client';
import { useDrag, useDragLayer } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
import {
  CalendarPost,
  CalendarPostCard,
} from '@gitroom/frontend/components/launches/calendar.post.card';

// What a card hands to the day it is dropped on, and to the layer that draws it
// on the way there. The first three fields are the drop's (calendar.tsx:676);
// the rest are the card's own, so the preview can be the card rather than a
// description of one.
export interface PostCardDrag {
  id: string;
  interval: boolean;
  date: dayjs.Dayjs;
  post: CalendarPost;
  state: State;
  isBeforeNow: boolean;
  showTime?: boolean;
}

// Measured off the card when the drag begins: a preview that sizes itself to
// its content is a different card in a 58px month cell than in the day view.
type HeldCard = PostCardDrag & { width?: number };

// Makes a post card draggable, and takes the preview off the browser.
//
// Both backends in the pipeline (dnd.provider.tsx) get this wrong on their own.
// The HTML5 backend snapshots the card into a rectangle, so the corners the
// 10px radius cuts away come back filled — the white wedges around a dragged
// card. The touch backend draws nothing at all, which left the card invisible
// under a finger, since it goes to `opacity: 0` the moment the drag starts.
// `getEmptyImage` silences the first; `CalendarDragLayer` answers both.
export const usePostCardDrag = (card: PostCardDrag) => {
  const node = useRef<HTMLDivElement | null>(null);
  // The spec is registered once, so the item is read through a ref rather than
  // closed over — otherwise a card that is re-rendered (a rescheduled post, a
  // renamed tag) would hand the drop the props it had on first paint.
  const latest = useRef(card);
  latest.current = card;

  const [{ opacity }, connectDrag, connectPreview] = useDrag(
    () => ({
      type: 'post',
      item: (): HeldCard => ({
        ...latest.current,
        width: node.current?.offsetWidth,
      }),
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0 : 1,
      }),
    }),
    []
  );

  useEffect(() => {
    connectPreview(getEmptyImage(), { captureDraggingState: true });
  }, [connectPreview]);

  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      connectDrag(element);
    },
    [connectDrag]
  );

  return { attach, opacity };
};

// The card under the pointer, for the length of the drag. Rendered once, inside
// the provider (launches.component.tsx) rather than per card, because there is
// only ever one drag: `useDragLayer` reads the monitor, not the card, which is
// also why one layer covers the mouse and the finger alike.
export const CalendarDragLayer: FC = () => {
  const { held, isDragging, offset } = useDragLayer((monitor) => ({
    held: monitor.getItem() as HeldCard | null,
    isDragging: monitor.isDragging(),
    offset: monitor.getSourceClientOffset(),
  }));

  if (!isDragging || !offset || !held?.post) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[400] pointer-events-none">
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          width: held.width,
        }}
      >
        <CalendarPostCard
          post={held.post}
          state={held.state}
          isBeforeNow={held.isBeforeNow}
          showTime={held.showTime}
          lifted
        />
      </div>
    </div>
  );
};
