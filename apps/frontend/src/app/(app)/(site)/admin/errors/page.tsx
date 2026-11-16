export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import {
  PageScroll,
  PAGE_PADDING,
} from '@gitroom/frontend/components/ui/page.scroll';
import clsx from 'clsx';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sharek' : 'Sharek'} Admin Errors`,
  description: '',
};

export default async function Page() {
  return (
    <PageScroll className={clsx(PAGE_PADDING, 'gap-[12px]')}>
      <AdminErrorsComponent />
    </PageScroll>
  );
}
