import { ThirdPartyComponent } from '@gitroom/frontend/components/third-parties/third-party.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { redirect } from 'next/navigation';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_integrations', 'Sharek Integrations'),
    description: '',
  };
}
export default async function Index() {
  if (!process.env.SHOW_THIRD_PARTY) {
    return redirect('/launches');
  }
  return <ThirdPartyComponent />;
}
