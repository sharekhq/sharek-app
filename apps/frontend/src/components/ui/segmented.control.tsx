'use client';

import { FC } from 'react';
import clsx from 'clsx';

/**
 * A row of mutually exclusive views, one visible at a time.
 *
 * Built for compose's narrow layout (`specs/017-compose-viewport`, shape A),
 * where the two-pane layout does not fit: below `mobile` the editor, the
 * per-channel settings and the preview take turns in a single pane instead of
 * needing 769px side by side.
 *
 * Buttons with `aria-pressed`, not `role="tab"`. A tablist owes the reader
 * tabpanels with `aria-controls` pointing at them, and compose's panes are
 * existing markup with no ids — claiming the role without the wiring describes
 * a structure that is not there. Toggle buttons in a labelled group say exactly
 * what this is.
 */
export const SegmentedControl: FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  /** Names the group for a screen reader. There is no visible label. */
  label: string;
  className?: string;
}> = ({ value, onChange, options, label, className }) => {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        'flex flex-1 min-w-0 gap-[2px] p-[3px] rounded-[10px] bg-surface2',
        className
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={clsx(
              // flex-1 with min-w-0 so three labels share the width evenly and
              // the longest one shrinks rather than widening the whole control
              // past the pane it sits in.
              'flex-1 min-w-0 truncate rounded-[8px] px-[8px]',
              // The floor phase 4 set for a finger. It is a min-height rather
              // than a height so a translation that wraps grows the control
              // instead of spilling out of it.
              'min-h-[38px] coarse:min-h-[44px]',
              'text-[13px] font-[600] transition-colors',
              // Not decoration: global.scss drops every outline, so this is the
              // only thing a keyboard user sees on the control that changes what
              // the whole modal is showing.
              'focus-visible:ring-2 focus-visible:ring-brand',
              selected
                ? 'bg-surface text-brandText shadow-card'
                : 'text-inkSoft hover:text-ink',
              // A view with nothing behind it yet — per-channel settings before
              // a channel is picked. Reads as unavailable rather than vanishing,
              // so the control does not change width as channels are chosen.
              option.disabled &&
                'opacity-50 cursor-not-allowed hover:text-inkSoft'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
