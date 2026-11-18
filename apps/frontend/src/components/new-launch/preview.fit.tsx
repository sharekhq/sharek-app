'use client';

import { FC, ReactNode, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';

// The composer's preview column draws each post at a phone's width, 420px,
// the width the providers' previews are written for, so a post looks as it
// will on a phone rather than stretched across the column (FR-028). It then
// scales the post down until the whole of it fits the column's height, never
// under 0.9: below that the text gets too small to read, so the post keeps
// 0.9 and the column scrolls (FR-029).
export const PREVIEW_PHONE_WIDTH = 420;
export const PREVIEW_MIN_SCALE = 0.9;

/** room and natural in px; 1 when either is 0 (hidden column, first paint). */
export const fitScale = (room: number, natural: number) =>
  natural <= 0 || room <= 0
    ? 1
    : Math.min(1, Math.max(PREVIEW_MIN_SCALE, room / natural));

/**
 * The preview inside three boxes: the room, the column's height; the sizer,
 * which takes the scaled post's size so the column centres and scrolls it;
 * and the content box, the post drawn at phone width and scaled from its top
 * corner. The content box is at least the room's height, so a preview that
 * fills its container (TikTok, YouTube) fills the phone-width box and keeps
 * a scale of 1.
 *
 * At 1025px and below, or before the room is measured, the boxes keep their
 * places with no sizes, no transform and none of them positioned, so the
 * preview is today's, full width, and one that fills its container fills the
 * column rather than a box with no height. The boxes are never swapped
 * out: `useMediaQuery` starts false and flips after mounting, and a swap
 * would mount the preview and every provider form inside it again.
 */
export const PreviewFit: FC<{ children: ReactNode }> = ({ children }) => {
  const room = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ room: 0, natural: 0 });
  const isMobile = useMediaQuery(MOBILE_QUERY);

  useEffect(() => {
    const roomBox = room.current;
    const contentBox = content.current;
    if (!roomBox || !contentBox) return;

    const measure = () => {
      const next = {
        room: roomBox.clientHeight,
        natural: contentBox.offsetHeight,
      };
      setSize((prev) =>
        prev.room === next.room && prev.natural === next.natural ? prev : next
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(roomBox);
    observer.observe(contentBox);

    return () => observer.disconnect();
  }, []);

  const fits = !isMobile && size.room > 0;
  const scale = fitScale(size.room, size.natural);

  return (
    <div ref={room} className="h-full">
      <div
        className={clsx(fits && 'relative', 'mx-auto')}
        style={
          fits
            ? {
                width: PREVIEW_PHONE_WIDTH * scale,
                height: size.natural * scale,
              }
            : undefined
        }
      >
        <div
          ref={content}
          className={clsx(
            fits && 'absolute top-0 start-0',
            'origin-top-left rtl:origin-top-right'
          )}
          style={
            fits
              ? {
                  width: PREVIEW_PHONE_WIDTH,
                  minHeight: size.room,
                  transform: `scale(${scale})`,
                }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
};
