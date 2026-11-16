import clsx from 'clsx';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';

/**
 * The two ways the dashboard lets someone pick: a switch for picking a view
 * (FR-032) and a chip for filtering a list (FR-033). One look each, shared
 * here so no page draws its own.
 *
 * The switch: Calendar's Day/Week/Month/List and its List view's post states,
 * Analytics' Last 7/30/90 days, Billing's Monthly/Yearly, Developers' clients,
 * sign-in and where-it-runs tabs, and Apps' Apps/Approved apps.
 * The chip: Studio's categories (with their counts), Media's All/Images/Videos
 * and the AI image window's styles.
 *
 * An option is `SWITCH_OPTION` plus `SWITCH_OPTION_IDLE` or `SWITCH_OPTION_ON`,
 * never both, as a chip is `CHIP` plus `CHIP_IDLE` or `CHIP_ON`: Tailwind emits
 * the idle colours after the current ones, so idle colours left on the current
 * option would win. The current option is semibold as well as tinted, so colour
 * is not the only cue. Each control keeps its own semantics and layout classes
 * (aria-pressed buttons, radiogroups with arrow keys, `mobile:` steps); only
 * its look comes from here.
 */
export const SWITCH_GROUP =
  'inline-flex items-center shrink-0 gap-[2px] p-[3px] border border-line rounded-[8px]';
export const SWITCH_OPTION = clsx(
  'inline-flex items-center justify-center h-[30px] coarse:min-h-[44px] px-[12px] rounded-[6px] text-[13px] whitespace-nowrap cursor-pointer transition-colors',
  FOCUS_RING
);
export const SWITCH_OPTION_IDLE = 'font-[500] text-muted hover:text-ink';
export const SWITCH_OPTION_ON =
  'font-[600] bg-brandSoft text-brandText hover:text-brandText';

export const CHIP = clsx(
  'inline-flex items-center gap-[6px] h-[32px] coarse:min-h-[44px] px-[12px] rounded-full border text-[13px] font-[600] whitespace-nowrap cursor-pointer transition-colors',
  FOCUS_RING
);
export const CHIP_IDLE = 'bg-surface text-inkSoft border-line hover:bg-panel';
export const CHIP_ON = 'bg-selectedBg text-selectedText border-transparent';
export const CHIP_COUNT =
  'min-w-[20px] h-[20px] px-[6px] rounded-full inline-flex items-center justify-center text-[11px] font-[600] tabular-nums';
export const CHIP_COUNT_IDLE = 'bg-panel text-muted';
export const CHIP_COUNT_ON = 'bg-surface';
