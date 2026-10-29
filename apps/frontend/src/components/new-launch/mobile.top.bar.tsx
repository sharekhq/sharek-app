'use client';

import React, { FC, KeyboardEvent, ReactNode, useRef, useState } from 'react';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ChevronLeftIcon,
  DropdownArrowIcon,
} from '@gitroom/frontend/components/ui/icons';

export interface MobileTopBarAction {
  label: string;
  variant: 'primary' | 'secondary' | 'tertiary';
  onClick: () => void;
  disabled?: boolean;
}

// The desktop buttons' styles: Add to calendar, Post Now, Save as Draft. Post
// Now keeps the outline in pomegranate with the normal text colour, never
// brandText (rose in dark).
const actionColors = {
  primary: 'bg-brand text-white',
  secondary: 'bg-surface border border-brand text-ink',
  tertiary: 'bg-btnSimple',
};

// The composer's header at 1025px and below. A single action runs directly,
// more than one opens a menu.
export const MobileTopBar: FC<{
  onBack: () => void;
  actions: MobileTopBarAction[];
  disabled: boolean;
  loading: boolean;
  // why the disabled actions are disabled: a tooltip cannot be read on touch
  reasons?: string[];
  children: ReactNode;
}> = ({ onBack, actions, disabled, loading, reasons = [], children }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const button = useRef<HTMLButtonElement>(null);
  const single = actions.length === 1;
  const lastDisabled = actions
    .map((action) => !!action.disabled)
    .lastIndexOf(true);

  // The composer behind is a modal whose Escape (useHotkeys) asks to close
  // the post, on the node React listens on (Next hydrates the document), so
  // only stopImmediatePropagation keeps an Escape meant for the menu from it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) {
      return;
    }
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className="hidden mobile:flex sticky top-0 z-[450] h-[60px] items-center gap-[8px] px-[16px] bg-newBgColorInner select-none">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('back', 'Back')}
        className="flex-none w-[44px] h-[44px] -ms-[10px] flex justify-center items-center rounded-[8px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ChevronLeftIcon strokeWidth={1.5} className="rtl:rotate-180" />
      </button>
      <div className="flex-1 min-w-0 flex">{children}</div>
      <div ref={ref} onKeyDown={onKeyDown} className="relative flex-none">
        <button
          ref={button}
          type="button"
          disabled={disabled || (single && actions[0].disabled)}
          onClick={() => (single ? actions[0].onClick() : setOpen(!open))}
          {...(!single && {
            'aria-haspopup': true,
            'aria-expanded': open,
          })}
          className={clsx(
            'relative min-w-[92px] h-[44px] rounded-[8px] flex justify-center items-center gap-[8px] text-[14px] font-[600] bg-brand text-white disabled:bg-btnSimple disabled:text-muted disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand',
            single ? 'px-[16px]' : 'ps-[20px] pe-[12px]'
          )}
        >
          {loading && (
            <div className="absolute inset-0 flex justify-center items-center">
              <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
            </div>
          )}
          <div className={clsx(loading && 'invisible')}>
            {single ? actions[0].label : t('post_action', 'Post')}
          </div>
          {!single && (
            <DropdownArrowIcon
              size={16}
              rotated={open}
              className={clsx(loading && 'invisible')}
            />
          )}
        </button>
        {open && (
          <div className="absolute end-0 top-[100%] mt-[8px] w-[228px] p-[12px] flex flex-col gap-[12px] bg-surface border border-line rounded-[8px] shadow-menu z-[300]">
            {actions.map((action, index) => (
              <React.Fragment key={action.label}>
                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                  className={clsx(
                    'h-[44px] rounded-[8px] text-[14px] font-[600] disabled:cursor-not-allowed disabled:opacity-80 focus-visible:ring-2 focus-visible:ring-brand',
                    actionColors[action.variant]
                  )}
                >
                  {action.label}
                </button>
                {index === lastDisabled && reasons.length > 0 && (
                  <div className="text-[13px] text-muted whitespace-pre-line">
                    {reasons.join('\n')}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
