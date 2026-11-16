import { FC, ReactNode } from 'react';
import clsx from 'clsx';

/**
 * A dashboard page's scroll box. Above 1025px the page scrolls inside its
 * content card, under the top bar, and the window never does: the host fills
 * the card's row and the box sits over it as the page's only scroller, so a
 * page taller than the screen moves nothing around it. At 1025px and below
 * the box is static and the window scrolls, as it always has there.
 *
 * `className` lands on the box, where the page's own padding and gaps go. No
 * hook and no client boundary, so a server route file renders it.
 */
export const PageScroll: FC<{ className?: string; children: ReactNode }> = ({
  className,
  children,
}) => (
  <div className="bg-newBgColorInner flex-1 min-w-0 relative">
    <div
      className={clsx(
        'absolute inset-0 overflow-y-auto flex flex-col mobile:static scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor',
        className
      )}
    >
      {children}
    </div>
  </div>
);

// A dashboard page's content, 20px inside its card on every side above
// 1025px, 12px at 1025px and below (FR-001).
export const PAGE_PADDING = 'p-[20px] mobile:p-[12px]';

// A card that holds text and controls pads its content by this (FR-022). A
// card made of rows keeps its rows' own padding.
export const CARD_PADDING = 'p-[20px] mobile:p-[16px]';
