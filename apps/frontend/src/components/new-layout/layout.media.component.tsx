'use client';

import { MediaBox } from '@gitroom/frontend/components/media/media.component';

export const MediaLayoutComponent = () => {
  // min-w-0: this root is a flex item of layout.component.tsx:222, a row
  // container, so min-width:auto floors it at its content's min-content — which
  // the pagination row inside sets at 624px. The floor then propagates up and
  // the shell's overflow-hidden cuts the grid, the search field and all. The
  // three sibling page roots took this in 019; this one was missed.
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 min-w-0 flex-col gap-[15px] transition-all">
      <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
    </div>
  );
};
