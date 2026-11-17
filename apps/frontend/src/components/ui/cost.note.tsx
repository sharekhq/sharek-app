'use client';

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

/** The info mark the cost line leads with; the stage's note under a wait too. */
export const InfoIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 16 16"
    fill="none"
    className={clsx('flex-none', className)}
    aria-hidden="true"
  >
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8 7.4V11M8 5v.6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * The action bar's cost line: what the primary action on this screen will
 * spend. Written by whoever owns the action it describes — the modal for its
 * own submit button, a provider for the bar it fills itself — which is why it
 * takes its text rather than deriving it.
 *
 * Shared by the AI image and AI video modals, so it lives here rather than in
 * either one's parts file.
 */
export const CostNote: FC<{ children: ReactNode }> = ({ children }) => (
  <span className="flex items-center gap-[6px] text-[12px] text-muted">
    <InfoIcon />
    {children}
  </span>
);
