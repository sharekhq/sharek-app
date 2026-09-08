'use client';

import { StudioComponent } from '@gitroom/frontend/components/studio/studio.component';

export const StudioLayoutComponent = () => {
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      <StudioComponent />
    </div>
  );
};
