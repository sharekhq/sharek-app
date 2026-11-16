'use client';

import { StudioComponent } from '@gitroom/frontend/components/studio/studio.component';
import {
  PageScroll,
  PAGE_PADDING,
} from '@gitroom/frontend/components/ui/page.scroll';
import clsx from 'clsx';

export const StudioLayoutComponent = () => {
  return (
    <PageScroll className={clsx(PAGE_PADDING, 'gap-[15px]')}>
      <StudioComponent />
    </PageScroll>
  );
};
