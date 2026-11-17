'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import EventEmitter from 'events';
import clsx from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const toaster = new EventEmitter();

export type ToasterType = 'success' | 'warning' | 'error' | 'info';

export interface ToasterAction {
  label: string;
  onClick: () => void;
}

// Semantic-token driven: the icon inherits the state colour (theme-adjusted in
// colors.scss so it clears contrast on its own theme's surface), sitting in a
// soft tint of that same token. Feather-outline style per DESIGN.md §6.
const TYPE_META: Record<
  ToasterType,
  { colorClass: string; cssVar: string; icon: ReactElement }
> = {
  success: {
    colorClass: 'text-success',
    cssVar: '--success',
    icon: (
      <>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </>
    ),
  },
  warning: {
    colorClass: 'text-warning',
    cssVar: '--warning',
    icon: (
      <>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  error: {
    colorClass: 'text-error',
    cssVar: '--error',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </>
    ),
  },
  info: {
    colorClass: 'text-info',
    cssVar: '--info',
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>
    ),
  },
};

export const Toaster = () => {
  const t = useT();
  const [showToaster, setShowToaster] = useState(false);
  const [toasterText, setToasterText] = useState('');
  const [toasterType, setToasterType] = useState<ToasterType>('success');
  const [toasterAction, setToasterAction] = useState<ToasterAction>();
  useEffect(() => {
    // One timer for the toast on screen: the next show clears it, so an
    // earlier toast's time never cuts the new one short.
    let timer: ReturnType<typeof setTimeout> | undefined;
    toaster.on(
      'show',
      (params: {
        text: string;
        type?: ToasterType;
        action?: ToasterAction;
      }) => {
        const { text, type, action } = params;
        setToasterText(text);
        setToasterType(type || 'success');
        setToasterAction(action);
        setShowToaster(true);
        clearTimeout(timer);
        timer = setTimeout(
          () => {
            setShowToaster(false);
          },
          action ? 10000 : 4200
        );
      }
    );
    return () => {
      clearTimeout(timer);
      toaster.removeAllListeners();
    };
  }, []);
  if (!showToaster) {
    return <></>;
  }
  const meta = TYPE_META[toasterType] || TYPE_META.success;
  const close = () => setShowToaster(false);
  return (
    <div
      role="status"
      className={clsx(
        'animate-fadeDown rounded-[10px] gap-[14px] flex items-center bg-surface border border-line p-[16px] min-w-[319px] fixed start-[50%] text-ink z-[900] top-[32px] -translate-x-[50%] min-h-[56px]',
        'shadow-menu'
      )}
    >
      <div
        className={clsx(
          'w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0',
          meta.colorClass
        )}
        style={{
          backgroundColor: `color-mix(in srgb, var(${meta.cssVar}) 15%, transparent)`,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {meta.icon}
        </svg>
      </div>
      <div className="flex-1 text-ink text-[14px]">{toasterText}</div>
      {!!toasterAction && (
        <>
          <Button
            variant="secondary"
            size="small"
            onClick={() => {
              close();
              toasterAction.onClick();
            }}
          >
            {toasterAction.label}
          </Button>
          <button
            type="button"
            onClick={close}
            aria-label={t('close', 'Close')}
            className="w-[32px] h-[32px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] flex items-center justify-center text-muted hover:text-ink hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

export const useToaster = () => {
  return {
    show: useCallback(
      (text: string, type?: ToasterType, action?: ToasterAction) => {
        toaster.emit('show', {
          text,
          type,
          action,
        });
      },
      []
    ),
  };
};
