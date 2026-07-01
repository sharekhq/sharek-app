'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import EventEmitter from 'events';
import clsx from 'clsx';

const toaster = new EventEmitter();

export type ToasterType = 'success' | 'warning' | 'error' | 'info';

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
  const [showToaster, setShowToaster] = useState(false);
  const [toasterText, setToasterText] = useState('');
  const [toasterType, setToasterType] = useState<ToasterType>('success');
  useEffect(() => {
    toaster.on('show', (params: { text: string; type?: ToasterType }) => {
      const { text, type } = params;
      setToasterText(text);
      setToasterType(type || 'success');
      setShowToaster(true);
      setTimeout(() => {
        setShowToaster(false);
      }, 4200);
    });
    return () => {
      toaster.removeAllListeners();
    };
  }, []);
  if (!showToaster) {
    return <></>;
  }
  const meta = TYPE_META[toasterType] || TYPE_META.success;
  return (
    <div
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
    </div>
  );
};

export const useToaster = () => {
  return {
    show: useCallback((text: string, type?: ToasterType) => {
      toaster.emit('show', {
        text,
        type,
      });
    }, []),
  };
};
