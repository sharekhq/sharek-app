'use client';

import { FC, ReactNode } from 'react';

/**
 * The bar pinned below a modal's scrolling body, holding whatever that screen's
 * actions are. Full-bleed by design: the negative margins span `new-modal`'s own
 * 32px padding so the divider reaches both edges and the fill meets the 24px
 * bottom radius — which is why those numbers live here, in one place, rather
 * than restated in every modal that wants a bar.
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
      className="pointer-events-none absolute inset-x-[-32px] bottom-full h-[24px]"
      style={{
        backgroundImage: 'linear-gradient(to top, var(--surface), transparent)',
      }}
    />
    <div className="-mx-[32px] -mb-[32px] px-[32px] py-[16px] border-t border-line rounded-b-[24px] bg-surface flex items-center gap-[10px]">
      {children}
    </div>
  </div>
);
