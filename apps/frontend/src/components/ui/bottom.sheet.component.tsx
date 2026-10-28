'use client';

import React, {
  FC,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
} from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ChevronRightIcon,
  CloseIcon,
} from '@gitroom/frontend/components/ui/icons';

// What Tab can land on inside a sheet: a control, unless it is disabled by
// itself or by a disabled fieldset around it (a locked composer's sheets).
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
const enabled = (control: HTMLElement) =>
  !control.matches(':disabled') && !control.closest('fieldset[disabled]');

// A modal surface's focus: while `active`, the container (tabIndex -1) takes
// the focus, Tab and Shift+Tab wrap among its enabled controls, and on
// deactivation the focus goes back to whatever had it before. Shared by the
// bottom sheets and the composer's channel settings pane at 1025px and below.
export const useDialogFocus = <T extends HTMLElement>(active: boolean) => {
  const container = useRef<T>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const opener = document.activeElement as HTMLElement | null;
    container.current?.focus();
    return () => {
      opener?.focus();
    };
  }, [active]);

  const keepTabInside = useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !container.current) {
      return;
    }
    const controls = Array.from(
      container.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter(enabled);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const focused = document.activeElement;
    if (!first) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (focused === first || focused === container.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && focused === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  return { container, keepTabInside };
};

export const BottomSheetHeader: FC<{
  title: ReactNode;
  titleId?: string;
  onClose: () => void;
}> = ({ title, titleId, onClose }) => {
  const t = useT();
  return (
    <>
      <div className="self-center w-[33px] h-[4px] mb-[8px] rounded-[2px] bg-newSep" />
      <div className="flex items-center gap-[8px] h-[60px] mb-[16px] ps-[16px] pe-[4px]">
        <div id={titleId} className="flex-1 text-[20px] font-[600]">
          {title}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close', 'Close')}
          className="w-[44px] h-[44px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <CloseIcon />
        </button>
      </div>
    </>
  );
};

export const BottomSheetButton: FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, onClick, disabled }) => {
  return (
    <div className="px-[16px] pt-[12px]">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="w-full h-[44px] rounded-[8px] bg-brand text-white text-[15px] font-[600] disabled:bg-btnSimple disabled:text-muted disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand"
      >
        {label}
      </button>
    </div>
  );
};

// Slides up from the bottom of the screen, opened from the small-screen
// layout. A modal dialog: it takes the focus and keeps Tab inside, Escape and
// the scrim close it, and the page behind it does not scroll.
export const BottomSheet: FC<{
  title: string;
  onClose: () => void;
  children: ReactNode;
  // the main action under the content, like Done or Save
  button?: { label: string; onClick: () => void; disabled?: boolean };
}> = ({ title, onClose, children, button }) => {
  const titleId = useId();
  const { container: dialog, keepTabInside } =
    useDialogFocus<HTMLDivElement>(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // the support chat bubble would cover the sheet's button
    document.body.classList.add('bottomSheetOpen');
    // What scrolls behind the sheet is whatever scroller it sits in (the
    // composer's full-screen overlay at 1025px and below): each one is held
    // still while the sheet is open.
    const held: Array<[HTMLElement, string]> = [];
    for (
      let node = root.current?.parentElement;
      node;
      node = node.parentElement
    ) {
      if (['auto', 'scroll'].includes(getComputedStyle(node).overflowY)) {
        held.push([node, node.style.overflowY]);
        node.style.overflowY = 'hidden';
      }
    }
    return () => {
      document.body.classList.remove('bottomSheetOpen');
      held.forEach(([node, overflowY]) => {
        node.style.overflowY = overflowY;
      });
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // The composer behind is a modal whose Escape (useHotkeys) asks to close
    // the post. Next hydrates the document, so React's listener and that one
    // sit on the same node, where stopPropagation does not reach: only
    // stopImmediatePropagation keeps the key from the composer.
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onClose();
      return;
    }
    keepTabInside(e);
  };

  return (
    <div ref={root} className="fixed inset-0 z-[600] flex flex-col justify-end">
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-popup backdrop-blur-[8px] animate-fadeIn touch-none"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative max-h-[90%] flex flex-col bg-newBgColorInner rounded-t-[24px] pt-[8px] pb-[calc(24px+env(safe-area-inset-bottom))] animate-fade"
      >
        <BottomSheetHeader title={title} titleId={titleId} onClose={onClose} />
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[16px] scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner">
          {children}
        </div>
        {button && <BottomSheetButton {...button} />}
      </div>
    </div>
  );
};

export const BottomSheetRow: FC<{
  icon: ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[44px] flex items-center gap-[12px] py-[8px] text-start rounded-[8px] select-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="text-muted">{icon}</span>
      <span className="flex-1 text-[15px] font-[600]">{label}</span>
      <ChevronRightIcon size={20} className="text-muted rtl:rotate-180" />
    </button>
  );
};
