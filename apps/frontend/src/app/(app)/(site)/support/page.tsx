import { SupportComponent } from '@gitroom/frontend/components/support/support.component';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { redirect } from 'next/navigation';
import { isSupportConfigured } from '@gitroom/helpers/utils/is.support.configured';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_support', 'Sharek Support'),
    description: '',
  };
}
export default async function Index() {
  // Unconfigured has to be invisible rather than broken: no dead entry in the
  // navigation, and no page that loads only to fail on submit.
  if (!isSupportConfigured()) {
    return redirect('/launches');
  }
  return <SupportComponent />;
}
