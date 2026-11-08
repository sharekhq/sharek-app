'use client';

import { FC, ReactNode, useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  MOBILE_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import {
  useDialogFocus,
  useSheetBackdrop,
} from '@gitroom/frontend/components/ui/bottom.sheet.component';

/**
 * A side rail on a wide screen, a bottom sheet at 1025px and below.
 *
 * Below that width (phones and iPads held upright) the rail leaves the page
 * and opens as upstream's channel sheet: full width from the bottom of the
 * screen, at most 80% of it tall, with 16px rounded top corners and room
 * under its last row, over a scrim. It draws no header: its child draws its
 * own, with the button that closes the sheet. The scrim, Escape and the screen
 * growing past 1025px close it too. While open there it is a modal dialog
 * named by its label, as 044's sheets are (and as the composer's settings pane
 * is, which is not a BottomSheet either): it takes the focus and keeps Tab
 * inside, holds the page behind it still and hides the support chat bubble.
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
  /** Names the sheet's dialog. The rail is not a dialog and carries none. */
  label: string;
  children: ReactNode;
  /** Rail width when expanded. The sheet is full-width. */
  width?: string;
  /** Desktop icon rail. Never on the sheet, which is full-width. */
  collapsed?: boolean;
}> = ({
  open,
  onClose,
  label,
  children,
  width = 'w-[260px]',
  collapsed = false,
}) => {
  // Only the open sheet at 1025px and below is a dialog; the rail is not.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const sheet = open && isMobile;
  const { container: dialog, keepTabInside } =
    useDialogFocus<HTMLDivElement>(sheet);
  const backdrop = useSheetBackdrop<HTMLDivElement>(sheet);

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

  // Growing past 1025px (an iPad turned to landscape) closes the sheet, so the
  // rail comes back as it was. It acts on the query turning false, not on its
  // being false: the query reads false on the first render, so a sheet that
  // mounts open on a phone would close at once.
  const wasMobile = useRef(isMobile);
  useEffect(() => {
    if (open && wasMobile.current && !isMobile) onCloseRef.current();
    wasMobile.current = isMobile;
  }, [open, isMobile]);

  return (
    <>
      <div
        ref={dialog}
        role={sheet ? 'dialog' : undefined}
        aria-modal={sheet ? true : undefined}
        aria-label={sheet ? label : undefined}
        tabIndex={sheet ? -1 : undefined}
        onKeyDown={sheet ? keepTabInside : undefined}
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
          ref={backdrop}
          className={clsx(
            'bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all absolute start-0 top-0 w-full h-full mobile:static mobile:h-auto mobile:max-h-[80vh] mobile:pb-[80px] overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor'
          )}
        >
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
