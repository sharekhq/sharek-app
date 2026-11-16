export const dynamic = 'force-dynamic';
import { BillingComponent } from '@gitroom/frontend/components/billing/billing.component';
import { PageScroll } from '@gitroom/frontend/components/ui/page.scroll';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_billing', 'Sharek Billing'),
    description: '',
  };
}
export default async function Page() {
  return (
    <PageScroll className="p-[20px] gap-[12px]">
      <BillingComponent />
    </PageScroll>
  );
}
