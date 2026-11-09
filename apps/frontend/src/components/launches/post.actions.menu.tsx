'use client';

import {
  forwardRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';

export interface PostAction {
  key: string;
  icon: ReactNode;
  label: string;
  // a second, muted line under the label that says what the action does
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}

// Enter and Space press a focused trigger or item the way a click does. The
// list renders inside the trigger, so an item's key stops at the item, or the
// trigger would open the list again.
const pressKeys = (run: () => void) => (e: ReactKeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') {
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  run();
};

// What owns a `held` menu opens and closes it with.
export interface PostActionsMenuHandle {
  open: () => void;
  close: () => void;
}

// A list `fixed` against the viewport, so no box that clips its content hides
// it, hung from the box `ref` is on: a press outside that box and the list
// (`panelRef`) closes it. PostActionsMenu's list renders in the box, the brand
// list's into the body (brands/brand.menu.tsx), and either is the box's own.
// `show` is where the list sits while it is open, from `below()`.
export const useHangingPanel = () => {
  const [show, setShow] = useState<false | { x: number; y: number }>(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  // under the trigger, from its start edge; the layout effect below corrects it
  const below = useCallback(() => {
    const box = ref.current?.getBoundingClientRect();
    return { x: box?.left || 0, y: (box?.bottom || 0) + 4 };
  }, [ref]);

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
    // Where the list doesn't fit below the post it opens above it, never over
    // it: a finger holding a month chip is still on the chip, and lit the item
    // pulled up under it. Only with no room on either side does it overlap.
    let y = show.y;
    if (panel.bottom > window.innerHeight - padding) {
      const above = trigger.top - panel.height - 4;
      y =
        above >= padding
          ? above
          : Math.max(padding, window.innerHeight - panel.height - padding);
    }

    if (Math.abs(show.x - x) > 1 || Math.abs(show.y - y) > 1) {
      setShow({ x, y });
    }
  }, [show, ref]);

  // A fixed panel does not travel with the card, and the calendar grid scrolls
  // (calendar.tsx:358). Closing is the honest answer to that. A scroll inside
  // the box or the list, a list that scrolls its own options, is no reason
  // to. A press outside both closes it too, on the events useClickOutside
  // listens for: it watched the box alone, and a list in the body is not in
  // it.
  useEffect(() => {
    if (!show) {
      return;
    }
    const close = (e: Event) => {
      const inside = [ref, panelRef].some(
        (box) => e.target instanceof Node && box.current?.contains(e.target)
      );
      if (!inside) {
        setShow(false);
      }
    };
    window.addEventListener('scroll', close, true);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [show, ref]);

  return { ref, panelRef, show, setShow, below };
};

// The week grid gives a day a 58px column (`minmax(58px, 1fr)`, calendar.tsx:358),
// and the post card's actions have never fitted it: finding 69 of the 2026-08
// responsive audit measured ~200px of unshrinkable controls under a coarse
// pointer and ~79px on the mouse path, centred, so they painted over the day
// before and the day after. Nothing that has to sit inside the cell can fix
// that — so the actions leave it. The strip becomes the button and the list
// opens as a `fixed` panel measured against the viewport, which is the shape
// the channel menu already uses (menu/menu.tsx:347).
//
// A month chip at 1025px and below has no room for the button, so it holds a
// `held` menu instead: no button, opened and closed through the ref by what
// owns it (a finger held still on the chip opens it, a drag closes it,
// calendar.tsx). It covers the chip, hangs the list from it, and lets every
// touch and click through to it.
//
// A menu that is a button of its own, not a card's strip, passes `trigger`
// and `triggerClassName`, and the button draws them in place of the strip's ⋯
// (the channel list's +, the chat's ⋯).
export const PostActionsMenu = forwardRef<
  PostActionsMenuHandle,
  {
    actions: PostAction[];
    label: string;
    held?: boolean;
    trigger?: ReactNode;
    triggerClassName?: string;
  }
>(function PostActionsMenu(props, handle) {
  const { actions, label, held, trigger, triggerClassName } = props;
  const { ref, panelRef, show, setShow, below } = useHangingPanel();

  const open = useCallback(() => {
    setShow((current) => (current ? false : below()));
  }, [below, setShow]);

  useImperativeHandle(
    handle,
    () => ({
      open: () => setShow(below()),
      close: () => setShow(false),
    }),
    [below, setShow]
  );

  const toggle = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      open();
    },
    [open]
  );

  // Escape closes the list too (a scroll does, useHangingPanel). While the
  // list is open Escape is the list's alone: it is heard on the way down and
  // goes no further, because SplitPanel closes the sheet a menu can open in on
  // an Escape that reaches the document (split.panel.tsx). Only an Escape
  // pressed in the list, on its trigger or with nothing focused, as a held
  // menu's is: a field or a dialog that has the focus meanwhile keeps its own.
  useEffect(() => {
    if (!show) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      // a key pressed with nothing focused comes from the body
      const elsewhere =
        e.target instanceof Node &&
        e.target !== document.body &&
        !ref.current?.contains(e.target);
      if (e.key !== 'Escape' || elsewhere) {
        return;
      }
      e.stopPropagation();
      setShow(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [show, ref, setShow]);

  const choose = (action: PostAction) => {
    setShow(false);
    action.onClick();
  };

  // A list whose items carry hints is 260 to 270px wide, as the reviewed
  // canvas draws the channel list's +, and its hints wrap inside it. The
  // minimum matters as much as the maximum: the list first renders at its
  // trigger's start edge, where a + at the end of the screen leaves it a few
  // pixels, and a list that can wrap would shrink to its longest word there
  // and then grow by a few pixels on each pass of the layout effect above.
  // It is spaced as the canvas spaces it too, 6px inside its edge, its items
  // touching and 10px from an icon to its text, which leaves its hints 210px.
  // So is every list that opens from a button of its own, the chat's ⋯ with no
  // hints among them; the post card's keeps the spacing it had.
  const hinted = actions.some((action) => action.hint);
  const compact = hinted || !!trigger;

  const panel = show && (
    <div
      ref={panelRef}
      role="menu"
      aria-label={held ? label : undefined}
      onClick={(e) => e.stopPropagation()}
      style={{ left: show.x, top: show.y }}
      // The panel is a child of the card's strip (of the card, when held),
      // which calendar.tsx:1172 paints `text-white` for a tag colour — and
      // `fixed` moves it on screen, not in the tree, so that colour still
      // inherits. It names its own foreground so the list reads as app chrome
      // wherever it opens.
      className={clsx(
        'fixed bg-newBgColorInner text-textColor shadow-menu flex flex-col z-[100] rounded-[8px] border border-tableBorder text-nowrap cursor-default',
        hinted && 'min-w-[260px] max-w-[270px]',
        compact ? 'p-[6px]' : 'p-[12px] gap-[16px]',
        held && 'pointer-events-auto'
      )}
    >
      {actions.map((action) => (
        <div
          key={action.key}
          role="menuitem"
          tabIndex={0}
          className={clsx(
            'flex py-[8px] px-[10px] rounded-[8px] cursor-pointer hover:bg-boxHover transition-colors',
            compact ? 'gap-[10px]' : 'gap-[12px]',
            action.hint ? 'items-start' : 'items-center'
          )}
          onClick={() => choose(action)}
          onKeyDown={pressKeys(() => choose(action))}
        >
          {/* beside a label and its hint, the icon stays level with the label */}
          <div
            className={clsx(
              'flex',
              action.danger && 'text-error',
              action.hint && 'mt-[2px]'
            )}
          >
            {action.icon}
          </div>
          {action.hint ? (
            // The list is `text-nowrap`, and a hint is a sentence: it wraps
            // within the list's width.
            <div className="flex flex-col gap-[2px]">
              <div className="text-[14px]">{action.label}</div>
              <div className="text-[12px] text-muted text-wrap">
                {action.hint}
              </div>
            </div>
          ) : (
            <div className="text-[14px]">{action.label}</div>
          )}
        </div>
      ))}
    </div>
  );

  if (held) {
    return (
      <div
        ref={ref}
        className="hidden mobile:block absolute inset-0 pointer-events-none"
      >
        {panel}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded={!!show}
      aria-label={label}
      onClick={toggle}
      onKeyDown={pressKeys(open)}
      // No z-index here. Being positioned is already enough to put the strip
      // over the tag name behind it, and any value turns this into a stacking
      // context that the panel's own `z-[100]` then resolves inside — which put
      // the whole list back under the provider badge the card body hangs at
      // `z-10` (calendar.tsx:1218), so the icon painted through the open menu.
      className={
        triggerClassName ??
        'absolute inset-0 flex items-center justify-end pe-[3px] rounded-tr-[10px] rounded-tl-[10px] cursor-pointer focus-visible:ring-2 focus-visible:ring-brand'
      }
    >
      {trigger ?? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className="text-muted"
        >
          <path
            d="M13.125 12C13.125 12.2225 13.059 12.44 12.9354 12.625C12.8118 12.81 12.6361 12.9542 12.4305 13.0394C12.225 13.1245 11.9988 13.1468 11.7805 13.1034C11.5623 13.06 11.3618 12.9528 11.2045 12.7955C11.0472 12.6382 10.94 12.4377 10.8966 12.2195C10.8532 12.0012 10.8755 11.775 10.9606 11.5695C11.0458 11.3639 11.19 11.1882 11.375 11.0646C11.56 10.941 11.7775 10.875 12 10.875C12.2984 10.875 12.5845 10.9935 12.7955 11.2045C13.0065 11.4155 13.125 11.7016 13.125 12ZM12 6.75C12.2225 6.75 12.44 6.68402 12.625 6.5604C12.81 6.43679 12.9542 6.26109 13.0394 6.05552C13.1245 5.84995 13.1468 5.62375 13.1034 5.40552C13.06 5.1873 12.9528 4.98684 12.7955 4.82951C12.6382 4.67217 12.4377 4.56503 12.2195 4.52162C12.0012 4.47821 11.775 4.50049 11.5695 4.58564C11.3639 4.67078 11.1882 4.81498 11.0646 4.99998C10.941 5.18499 10.875 5.4025 10.875 5.625C10.875 5.92337 10.9935 6.20952 11.2045 6.4205C11.4155 6.63147 11.7016 6.75 12 6.75ZM12 17.25C11.7775 17.25 11.56 17.316 11.375 17.4396C11.19 17.5632 11.0458 17.7389 10.9606 17.9445C10.8755 18.15 10.8532 18.3762 10.8966 18.5945C10.94 18.8127 11.0472 19.0132 11.2045 19.1705C11.3618 19.3278 11.5623 19.435 11.7805 19.4784C11.9988 19.5218 12.225 19.4995 12.4305 19.4144C12.6361 19.3292 12.8118 19.185 12.9354 19C13.059 18.815 13.125 18.5975 13.125 18.375C13.125 18.0766 13.0065 17.7905 12.7955 17.5795C12.5845 17.3685 12.2984 17.25 12 17.25Z"
            fill="currentColor"
          />
        </svg>
      )}
      {panel}
    </div>
  );
});
