import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import {
  CHIP,
  CHIP_COUNT,
  CHIP_COUNT_IDLE,
  CHIP_COUNT_ON,
  CHIP_IDLE,
  CHIP_ON,
  SWITCH_GROUP,
  SWITCH_OPTION,
  SWITCH_OPTION_IDLE,
  SWITCH_OPTION_ON,
} from '@gitroom/frontend/components/ui/pick.controls';

// One look for picking a view (the switch: Calendar's Day/Week/Month/List,
// Analytics' days, Billing's Monthly/Yearly, Developers' and Apps' tabs) and
// one for filtering a list (the chip: Studio's categories, Media's kinds, the
// AI image window's styles), FR-032 and FR-033. Each control keeps its own
// semantics and layout classes; only these strings are shared. An option takes
// SWITCH_OPTION plus one of its two halves, never both, as a chip takes CHIP
// plus CHIP_IDLE or CHIP_ON: Tailwind emits the idle colours after the current
// ones, so idle colours left on the current option would win.

const tokens = (classes: string) => classes.split(' ');

describe('the switch', () => {
  it('draws its group as a bordered strip with 8px corners', () => {
    expect(SWITCH_GROUP).toBe(
      'inline-flex shrink-0 gap-[2px] p-[3px] border border-line rounded-[8px]'
    );
  });

  it('draws an option 30px tall at 13px, 44px under a coarse pointer, with the focus ring', () => {
    expect(SWITCH_OPTION).toBe(
      'inline-flex items-center justify-center h-[30px] coarse:min-h-[44px] px-[12px] rounded-[6px] text-[13px] whitespace-nowrap cursor-pointer transition-colors ' +
        FOCUS_RING
    );
    expect(SWITCH_OPTION.endsWith(FOCUS_RING)).toBe(true);
    expect(tokens(SWITCH_OPTION)).toContain('coarse:min-h-[44px]');
  });

  it('leaves the weight and the text colour to the half an option takes', () => {
    expect(tokens(SWITCH_OPTION).filter((t) => /(^|:)font-/.test(t))).toEqual(
      []
    );
    expect(
      tokens(SWITCH_OPTION).filter((t) => /(^|:)text-(?!\[\d+px\])/.test(t))
    ).toEqual([]);
  });

  it('draws an idle option medium and muted', () => {
    expect(SWITCH_OPTION_IDLE).toBe('font-[500] text-muted hover:text-ink');
    expect(tokens(SWITCH_OPTION_IDLE)).toContain('font-[500]');
  });

  // The current option is semibold as well as tinted, so colour is not the
  // only cue (constitution III).
  it('draws the current option semibold on the soft brand tint', () => {
    expect(SWITCH_OPTION_ON).toBe(
      'font-[600] bg-brandSoft text-brandText hover:text-brandText'
    );
    expect(tokens(SWITCH_OPTION_ON)).toContain('font-[600]');
  });
});

describe('the chip', () => {
  it('draws a chip as a 32px pill at 13px semibold, 44px under a coarse pointer, with the focus ring', () => {
    expect(CHIP).toBe(
      'inline-flex items-center gap-[6px] h-[32px] coarse:min-h-[44px] px-[12px] rounded-full border text-[13px] font-[600] whitespace-nowrap cursor-pointer transition-colors ' +
        FOCUS_RING
    );
    expect(CHIP.endsWith(FOCUS_RING)).toBe(true);
    expect(tokens(CHIP)).toContain('coarse:min-h-[44px]');
  });

  it('draws an idle chip on the surface with a line', () => {
    expect(CHIP_IDLE).toBe(
      'bg-surface text-inkSoft border-line hover:bg-panel'
    );
  });

  it('draws the current chip in the selected colours', () => {
    expect(CHIP_ON).toBe('bg-selectedBg text-selectedText border-transparent');
  });

  it('draws the count in a chip as a 20px badge at 11px', () => {
    expect(CHIP_COUNT).toBe(
      'min-w-[20px] h-[20px] px-[6px] rounded-full inline-flex items-center justify-center text-[11px] font-[600] tabular-nums'
    );
    expect(CHIP_COUNT_IDLE).toBe('bg-panel text-muted');
    expect(CHIP_COUNT_ON).toBe('bg-surface');
  });
});
