'use client';

import { FC, ReactNode, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * A side rail on a wide screen, a bottom sheet at 1025px and below.
 *
 * Below that width (phones and iPads held upright) the rail leaves the page
 * and opens as upstream's channel sheet: full width from the bottom of the
 * screen, at most 80% of it tall, with 16px rounded top corners and room
 * under its last row, over a scrim. Its close button, the scrim and Escape
 * close it. The calendar's channel list is its user.
 *
 * The open state stays with the caller. It has to: the control that opens the
 * sheet sits in the *content* column, a sibling of this panel, and hoisting
 * the state into a context here would re-render the calendar — which already
 * re-renders on every drag hover — for a small-screen-only style.
 */
export const SplitPanel: FC<{
  /** Sheet state. Inert above 1025px, where this is a rail. */
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Rail width when expanded. The sheet is full-width. */
  width?: string;
  /** Desktop icon rail. Never on the sheet, which is full-width. */
  collapsed?: boolean;
  /** Renders the collapse chevron. Omit it and the rail cannot collapse. */
  onToggleCollapse?: () => void;
  title?: ReactNode;
}> = ({
  open,
  onClose,
  children,
  width = 'w-[260px]',
  collapsed = false,
  onToggleCollapse,
  title,
}) => {
  const t = useT();

  // Read through a ref, so the listener below depends on `open` alone. Callers
  // pass an inline arrow, which is a new identity every render — and the
  // calendar re-renders on every drag hover, which would otherwise tear the
  // listener down and rebuild it on each one.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes the sheet. Bound only while it is open, so a screen with a
  // closed sheet carries no listener.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <div
        className={clsx(
          // shrink-0: the rail's only child is absolutely positioned, so its
          // min-content is 0 and a greedy sibling can shrink it to nothing —
          // which is what put Create Post under the calendar on a tablet.
          'flex relative flex-col shrink-0',
          collapsed ? 'group sidebar w-[100px]' : width,
          // 1025px and below: out of the page until the caller opens it, then
          // a sheet from the bottom of the screen
          open
            ? 'mobile:fixed mobile:inset-x-0 mobile:bottom-0 mobile:z-[190] mobile:w-full mobile:max-h-[80vh] mobile:rounded-t-[16px] mobile:overflow-hidden'
            : 'mobile:hidden'
        )}
      >
        <div
          className={clsx(
            'bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all absolute start-0 top-0 w-full h-full mobile:static mobile:h-auto mobile:max-h-[80vh] mobile:pb-[80px] overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor'
          )}
        >
          {/* justify-end is what puts the controls on the far edge when there
              is no title to push them there; a `flex-1` title makes it a
              no-op. A row holding nothing but the sheet's close button is
              `hidden` above 1025px — an empty flex child still takes
              the column's `gap`, which would space a rail that has no header
              differently from how it was spaced before. */}
          <div
            className={clsx(
              'flex items-center',
              !title && 'justify-end',
              !title && !onToggleCollapse && 'hidden mobile:flex'
            )}
          >
            {!!title && (
              <h2 className="group-[.sidebar]:hidden flex-1 text-[20px] font-[500]">
                {title}
              </h2>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close', 'Close')}
              className="hidden mobile:flex mobile:w-[44px] mobile:h-[44px] text-btnText bg-btnSimple rounded-[6px] items-center justify-center cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M9 3L3 9M3 3l6 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {!!onToggleCollapse && (
              <div
                onClick={onToggleCollapse}
                className="mobile:hidden group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] coarse:w-[44px] coarse:h-[44px] flex items-center justify-center cursor-pointer select-none"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="7"
                  height="13"
                  viewBox="0 0 7 13"
                  fill="none"
                >
                  <path
                    d="M6 11.5L1 6.5L6 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
          {children}
        </div>
      </div>
      {open && (
        <div
          className="hidden mobile:block fixed inset-0 z-[180] bg-black/50"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
};
