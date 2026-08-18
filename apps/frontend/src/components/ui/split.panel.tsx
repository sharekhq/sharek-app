'use client';

import { FC, ReactNode, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * A side rail on a wide screen, an off-canvas drawer on a phone.
 *
 * Seven of these were hand-written across six screens and each one forgot a
 * different part: the calendar's is the only one that ever grew the drawer,
 * and Agents' two are `phone:hidden` with no way back — a rail a phone user
 * cannot reach at all. This is that calendar rail, lifted out unchanged, so
 * the next screen that wants one inherits the small-screen case instead of
 * rediscovering it.
 *
 * The open state stays with the caller. It has to: the control that opens the
 * drawer sits in the *content* column, a sibling of this panel, and hoisting
 * the state into a context here would re-render the calendar — which already
 * re-renders on every drag hover — for a phone-only style.
 */
export const SplitPanel: FC<{
  /** Drawer state. Inert above the `phone` breakpoint, where this is a rail. */
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** The edge the rail sits on, and the edge its drawer enters from. */
  side?: 'start' | 'end';
  /** Rail width when expanded. The drawer's own width is fixed. */
  width?: string;
  /** Desktop icon rail. Never on a phone, where the drawer is full-width. */
  collapsed?: boolean;
  /** Renders the collapse chevron. Omit it and the rail cannot collapse. */
  onToggleCollapse?: () => void;
  title?: ReactNode;
}> = ({
  open,
  onClose,
  children,
  side = 'start',
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

  // Escape closes the drawer. Bound only while it is open, so a screen with a
  // closed drawer carries no listener.
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
          // Phone: off-canvas sheet revealed by the caller's toggle. Split
          // around the edge so the class string reads in the order the
          // calendar's hand-written rail wrote it, which is what makes this
          // migration a no-op the probe can confirm rather than interpret.
          'phone:fixed phone:inset-y-0',
          side === 'end' ? 'phone:end-0' : 'phone:start-0',
          'phone:z-[50] phone:!w-[300px] phone:max-w-[85vw]',
          'phone:transition-transform phone:duration-300 phone:ease-out motion-reduce:transition-none',
          open
            ? 'phone:translate-x-0'
            : side === 'end'
            ? 'phone:translate-x-full phone:rtl:-translate-x-full'
            : 'phone:-translate-x-full phone:rtl:translate-x-full'
        )}
      >
        <div
          className={clsx(
            'bg-newBgColorInner p-[20px] flex flex-col gap-[15px] transition-all absolute start-0 top-0 w-full h-full overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor'
          )}
        >
          {/* justify-end is what puts the controls on the far edge when there
              is no title to push them there; a `flex-1` title makes it a
              no-op. A row holding nothing but the phone-only close button is
              `hidden` above the breakpoint — an empty flex child still takes
              the column's `gap`, which would space a rail that has no header
              differently from how it was spaced before. */}
          <div
            className={clsx(
              'flex items-center',
              !title && 'justify-end',
              !title && !onToggleCollapse && 'hidden phone:flex'
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
              className="hidden phone:flex text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] coarse:w-[44px] coarse:h-[44px] items-center justify-center cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-brand"
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
                className="phone:hidden group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto text-btnText bg-btnSimple rounded-[6px] w-[24px] h-[24px] coarse:w-[44px] coarse:h-[44px] flex items-center justify-center cursor-pointer select-none"
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
          className="hidden phone:block fixed inset-0 z-[40] bg-black/50"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    </>
  );
};

/**
 * The control that opens a {@link SplitPanel}'s drawer. It belongs to the
 * content column rather than to the panel — a control inside a panel that is
 * translated off the screen cannot be used to bring it back.
 */
export const SplitPanelToggle: FC<{
  onClick: () => void;
  children: ReactNode;
}> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="hidden phone:flex items-center gap-[8px] self-start rounded-[8px] border border-line px-[12px] py-[8px] coarse:min-h-[44px] text-[14px] font-[500] text-textColor hover:bg-boxHover transition-colors focus-visible:ring-2 focus-visible:ring-brand"
  >
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="2.25"
        y="3"
        width="13.5"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M6.75 3v12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
    {children}
  </button>
);
