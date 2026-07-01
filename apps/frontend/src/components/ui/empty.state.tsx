'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from '@gitroom/react/form/button';

export interface EmptyStateProps {
  /** On-brand spot illustration; rendered decorative (aria-hidden). */
  illustration: ReactNode;
  title: string;
  description?: ReactNode;
  /** Smaller, muted helper line below the description (e.g. supported platforms). */
  note?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Defaults to a plus glyph when an action is present. */
  actionIcon?: ReactNode;
  /** Custom action node(s); replaces the default single Button when provided. */
  actions?: ReactNode;
  className?: string;
}

const DefaultActionIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 3.333v9.334M3.333 8h9.334"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Shared empty / first-run state. Restrained product-register hierarchy:
 * one ~20px heading, a muted ~14px line, an optional helper note, one CTA.
 * Replaces the per-screen oversized two-line headings. RTL-safe (centred,
 * logical spacing) and theme-aware (illustrations drive colour from tokens).
 */
export const EmptyState: FC<EmptyStateProps> = ({
  illustration,
  title,
  description,
  note,
  actionLabel,
  onAction,
  actionIcon,
  actions,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-1 flex-col items-center justify-center px-[24px] py-[40px] text-center',
        className
      )}
    >
      <div aria-hidden="true">{illustration}</div>
      <div className="mt-[24px] flex max-w-[420px] flex-col items-center gap-[8px]">
        <h2 className="text-balance text-[20px] font-[600] leading-[1.3] text-ink">
          {title}
        </h2>
        {description && (
          <p className="text-pretty text-[14px] leading-[1.6] text-inkSoft">
            {description}
          </p>
        )}
        {note && (
          <p className="text-[13px] leading-[1.5] text-muted">{note}</p>
        )}
      </div>
      {actions ? (
        <div className="mt-[24px] flex items-center gap-[8px]">{actions}</div>
      ) : (
        actionLabel &&
        onAction && (
          <Button
            onClick={onAction}
            className="mt-[24px]"
            innerClassName="gap-[8px]"
          >
            {actionIcon ?? <DefaultActionIcon />}
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
};
