'use client';

import {
  FC,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useClickOutside } from '@mantine/hooks';
import clsx from 'clsx';

export interface PostAction {
  key: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// The week grid gives a day a 58px column (`minmax(58px, 1fr)`, calendar.tsx:358),
// and the post card's actions have never fitted it: finding 69 of the 2026-08
// responsive audit measured ~200px of unshrinkable controls under a coarse
// pointer and ~79px on the mouse path, centred, so they painted over the day
// before and the day after. Nothing that has to sit inside the cell can fix
// that — so the actions leave it. The strip becomes the button and the list
// opens as a `fixed` panel measured against the viewport, which is the shape
// the channel menu already uses (menu/menu.tsx:347).
export const PostActionsMenu: FC<{
  actions: PostAction[];
  label: string;
}> = (props) => {
  const { actions, label } = props;
  const [show, setShow] = useState<false | { x: number; y: number }>(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useClickOutside<HTMLDivElement>(() => setShow(false));

  const open = useCallback(() => {
    const box = ref.current?.getBoundingClientRect();
    setShow((current) =>
      current ? false : { x: box?.left || 0, y: (box?.bottom || 0) + 4 }
    );
  }, [ref]);

  const toggle = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      open();
    },
    [open]
  );

  const keyToggle = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      open();
    },
    [open]
  );

  // The panel is placed against the viewport, so it has to be pulled back
  // inside one when the card sits near an edge — and in Arabic it hangs from
  // the trigger's other side. Both need the rendered width, so they run once
  // the panel exists, guarded the way menu.tsx:75 guards its own correction.
  useLayoutEffect(() => {
    if (!show || !panelRef.current || !ref.current) {
      return;
    }
    const panel = panelRef.current.getBoundingClientRect();
    const trigger = ref.current.getBoundingClientRect();
    const padding = 10;
    const rtl =
      getComputedStyle(document.documentElement).direction === 'rtl';

    let x = rtl ? trigger.right - panel.width : trigger.left;
    x = Math.max(padding, Math.min(x, window.innerWidth - panel.width - padding));
    let y = show.y;
    if (panel.bottom > window.innerHeight - padding) {
      y = Math.max(padding, window.innerHeight - panel.height - padding);
    }

    if (Math.abs(show.x - x) > 1 || Math.abs(show.y - y) > 1) {
      setShow({ x, y });
    }
  }, [show, ref]);

  // A fixed panel does not travel with the card, and the calendar grid scrolls
  // (calendar.tsx:358). Closing is the honest answer to that, and to Escape.
  useEffect(() => {
    if (!show) {
      return;
    }
    const close = () => setShow(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [show]);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={!!show}
      aria-label={label}
      onClick={toggle}
      onKeyDown={keyToggle}
      className="absolute inset-0 z-[10] flex items-center justify-end pe-[3px] rounded-tr-[10px] rounded-tl-[10px] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        className="hidden group-hover:block coarse:block text-muted"
      >
        <path
          d="M13.125 12C13.125 12.2225 13.059 12.44 12.9354 12.625C12.8118 12.81 12.6361 12.9542 12.4305 13.0394C12.225 13.1245 11.9988 13.1468 11.7805 13.1034C11.5623 13.06 11.3618 12.9528 11.2045 12.7955C11.0472 12.6382 10.94 12.4377 10.8966 12.2195C10.8532 12.0012 10.8755 11.775 10.9606 11.5695C11.0458 11.3639 11.19 11.1882 11.375 11.0646C11.56 10.941 11.7775 10.875 12 10.875C12.2984 10.875 12.5845 10.9935 12.7955 11.2045C13.0065 11.4155 13.125 11.7016 13.125 12ZM12 6.75C12.2225 6.75 12.44 6.68402 12.625 6.5604C12.81 6.43679 12.9542 6.26109 13.0394 6.05552C13.1245 5.84995 13.1468 5.62375 13.1034 5.40552C13.06 5.1873 12.9528 4.98684 12.7955 4.82951C12.6382 4.67217 12.4377 4.56503 12.2195 4.52162C12.0012 4.47821 11.775 4.50049 11.5695 4.58564C11.3639 4.67078 11.1882 4.81498 11.0646 4.99998C10.941 5.18499 10.875 5.4025 10.875 5.625C10.875 5.92337 10.9935 6.20952 11.2045 6.4205C11.4155 6.63147 11.7016 6.75 12 6.75ZM12 17.25C11.7775 17.25 11.56 17.316 11.375 17.4396C11.19 17.5632 11.0458 17.7389 10.9606 17.9445C10.8755 18.15 10.8532 18.3762 10.8966 18.5945C10.94 18.8127 11.0472 19.0132 11.2045 19.1705C11.3618 19.3278 11.5623 19.435 11.7805 19.4784C11.9988 19.5218 12.225 19.4995 12.4305 19.4144C12.6361 19.3292 12.8118 19.185 12.9354 19C13.059 18.815 13.125 18.5975 13.125 18.375C13.125 18.0766 13.0065 17.7905 12.7955 17.5795C12.5845 17.3685 12.2984 17.25 12 17.25Z"
          fill="currentColor"
        />
      </svg>
      {show && (
        <div
          ref={panelRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{ left: show.x, top: show.y }}
          // The panel is a child of the card's strip, which calendar.tsx:1172
          // paints `text-white` for a tag colour — and `fixed` moves it on
          // screen, not in the tree, so that colour still inherits. It names its
          // own foreground so the list reads as app chrome wherever it opens.
          className="fixed p-[12px] bg-newBgColorInner text-textColor shadow-menu flex flex-col gap-[16px] z-[100] rounded-[8px] border border-tableBorder text-nowrap cursor-default"
        >
          {actions.map((action) => (
            <div
              key={action.key}
              role="menuitem"
              tabIndex={0}
              className="flex gap-[12px] items-center py-[8px] px-[10px] cursor-pointer"
              onClick={() => {
                setShow(false);
                action.onClick();
              }}
            >
              <div className={clsx('flex', action.danger && 'text-error')}>
                {action.icon}
              </div>
              <div className="text-[14px]">{action.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
