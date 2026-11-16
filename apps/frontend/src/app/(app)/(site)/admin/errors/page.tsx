export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import { PageScroll } from '@gitroom/frontend/components/ui/page.scroll';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sharek' : 'Sharek'} Admin Errors`,
  description: '',
};

export default async function Page() {
  return (
    <PageScroll className="p-[20px] gap-[12px]">
      <AdminErrorsComponent />
    </PageScroll>
  );
}
