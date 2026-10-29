'use client';

import { FC, ReactNode } from 'react';

/**
 * The bar pinned below a modal's scrolling body, holding whatever that screen's
 * actions are. Full-bleed by design: the negative margins span `new-modal`'s own
 * 32px padding so the divider reaches both edges and the fill meets the 24px
 * bottom radius — which is why those numbers live here, in one place, rather
 * than restated in every modal that wants a bar. At 1025px and below the card
 * pads 16px with 16px corners, so the bar does too: pulled out by 32px there it
 * ran past the screen, and the whole modal scrolled sideways under a finger.
 *
 * Callers decide what goes in it and when it appears; a screen with nothing to
 * act on renders none.
 */
export const ModalActionBar: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="relative">
    {/* Content running under the bar reads as scrollable rather than cut off.
        Premultiplied-alpha interpolation is why this fades to `transparent`
        without greying through the midpoint. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[-32px] mobile:inset-x-[-16px] bottom-full h-[24px]"
      style={{
        backgroundImage: 'linear-gradient(to top, var(--surface), transparent)',
      }}
    />
    {/* flex-wrap, because the alternative is worse than a second row: with
        three actions and a spacer this bar is wider than a phone, and an
        unwrapped row pushes the submit button off the screen it was opened
        on. `gap` already carries the row gap. */}
    <div className="-mx-[32px] -mb-[32px] px-[32px] mobile:-mx-[16px] mobile:-mb-[16px] mobile:px-[16px] py-[16px] border-t border-line rounded-b-[24px] mobile:rounded-b-[16px] bg-surface flex flex-wrap items-center gap-[10px]">
      {children}
    </div>
  </div>
);
