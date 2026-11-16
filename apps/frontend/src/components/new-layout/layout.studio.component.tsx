'use client';

import { StudioComponent } from '@gitroom/frontend/components/studio/studio.component';
import { PageScroll } from '@gitroom/frontend/components/ui/page.scroll';

export const StudioLayoutComponent = () => {
  return (
    <PageScroll className="p-[20px] gap-[15px]">
      <StudioComponent />
    </PageScroll>
  );
};
