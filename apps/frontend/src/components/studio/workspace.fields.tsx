'use client';

import { FC, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Button } from '@gitroom/react/form/button';
import { AspectTile } from '@gitroom/frontend/components/ui/aspect.tile';

// The field parts every tool's settings share, so the AI image and AI video
// tools and their providers draw a field the same way. Each tool keeps its own
// fields, order, defaults and hints: the parts take words, already translated
// by the caller, never keys.

/** The label and hint pair every field repeats, above the field itself. */
export const FieldLabel: FC<{
  label: string;
  hint?: string;
  children: ReactNode;
}> = ({ label, hint, children }) => (
  <div className="flex flex-col gap-[6px]">
    <div className="flex flex-col gap-[2px]">
      <div className="text-[14px] font-[600]">{label}</div>
      {hint && <div className="text-[12px] text-muted">{hint}</div>}
    </div>
    {children}
  </div>
);

export interface OrientationFieldProps {
  label: string;
  options: {
    id: string;
    label: string;
    ratio: string;
    glyph: { width: number; height: number };
    tooltipHtml: string;
  }[];
  value: string;
  onChange: (id: string) => void;
}

/** A shape choice: one AspectTile per option, in one row. */
export const OrientationField: FC<OrientationFieldProps> = ({
  label,
  options,
  value,
  onChange,
}) => (
  <FieldLabel label={label}>
    <div className="flex gap-[8px]">
      {options.map((option) => (
        <AspectTile
          key={option.id}
          label={option.label}
          ratio={option.ratio}
          glyph={option.glyph}
          selected={value === option.id}
          tooltipHtml={option.tooltipHtml}
          onSelect={() => onChange(option.id)}
        />
      ))}
    </div>
  </FieldLabel>
);

export interface ChoiceFieldProps {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  /** The line under the row, e.g. what the chosen option does. */
  hint?: string;
}

/**
 * One choice from a few, as equal outlined buttons sharing the row; the chosen
 * one keeps the soft brand fill and its brand border.
 */
export const ChoiceField: FC<ChoiceFieldProps> = ({
  label,
  options,
  value,
  onChange,
  hint,
}) => (
  <FieldLabel label={label}>
    <div className="flex gap-[8px]">
      {options.map((option) => (
        <Button
          key={option.id}
          type="button"
          variant="secondary"
          aria-pressed={value === option.id}
          className={clsx(
            // at 1025px and below the options share the row, as the voice
            // sets do: at the Button's 16px sides six of them ran past a phone
            '!flex-1 mobile:min-w-0 mobile:px-[8px]',
            value === option.id && '!bg-brandSoft !text-brandText !border-brand'
          )}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </Button>
      ))}
    </div>
    {hint && <div className="text-[12px] text-muted">{hint}</div>}
  </FieldLabel>
);
