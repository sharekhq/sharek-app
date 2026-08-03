'use client';

import { FC } from 'react';
import { clsx } from 'clsx';

/**
 * The box a finished image or video is fitted into, shared by both AI modals so
 * the same shape comes out the same size whichever one made it. The width clears
 * the narrower of the two panels — the image modal leaves 488px inside its own
 * padding, the video modal 496px — and the height is what keeps the tallest
 * case, a 1:1 image, inside a laptop viewport once the modal's chrome and
 * action bar are counted.
 */
export const MEDIA_PREVIEW_MAX_WIDTH = 460;
export const MEDIA_PREVIEW_MAX_HEIGHT = 440;

export interface AspectTileProps {
  /** Rendered label, already translated by the caller. */
  label: string;
  /** Ratio caption, e.g. "9:16". Latin digits in both languages. */
  ratio: string;
  /** Glyph box in px. Any height is safe: the glyph sits in a fixed 24px row. */
  glyph: { width: number; height: number };
  selected: boolean;
  /** Already-translated tooltip HTML, or undefined for no tooltip. */
  tooltipHtml?: string;
  onSelect: () => void;
}

/**
 * One shape choice — a proportional glyph, a name and a ratio — shared by the
 * image modal's Size control and the video modal's Orientation control so the
 * two read as the same control rather than two takes on it.
 *
 * The glyph occupies a fixed 24px row. Without it the tile is a column whose
 * first child ranges from 13px (Landscape) to 23px (Story), which left short
 * glyphs' labels sitting ~10px above their neighbours'.
 */
export const AspectTile: FC<AspectTileProps> = ({
  label,
  ratio,
  glyph,
  selected,
  tooltipHtml,
  onSelect,
}) => (
  // A button, not a div: the tooltip has to be reachable by keyboard focus and
  // by tap, not only by hover.
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    data-tooltip-id={tooltipHtml ? 'tooltip' : undefined}
    data-tooltip-html={tooltipHtml}
    className={clsx(
      'flex-1 flex flex-col items-center gap-[6px] px-[6px] pt-[12px] pb-[10px] rounded-[14px] border transition-colors',
      // The app zeroes every outline (`body *` in global.scss), so keyboard
      // focus has to be drawn with a ring or it is not drawn at all.
      'focus-visible:ring-2 focus-visible:ring-brand',
      selected
        ? 'bg-brandSoft border-brand'
        : 'bg-surface border-line hover:border-inkSoft'
    )}
  >
    {/* The fixed track. Label position is independent of glyph height. */}
    <span className="h-[24px] flex items-center justify-center">
      <span
        style={{ width: glyph.width, height: glyph.height }}
        className={clsx(
          'block border-2 rounded-[3px]',
          selected ? 'border-brandText' : 'border-muted'
        )}
      />
    </span>
    <span
      className={clsx('text-[13px] font-[600]', selected && 'text-brandText')}
    >
      {label}
    </span>
    {/* Fixed direction: a ratio is read the same way in both languages. */}
    <span dir="ltr" className="text-[11px] text-muted">
      {ratio}
    </span>
  </button>
);
