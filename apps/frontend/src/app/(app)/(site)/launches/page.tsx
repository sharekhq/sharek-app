export const dynamic = 'force-dynamic';
import { LaunchesComponent } from '@gitroom/frontend/components/launches/launches.component';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: isGeneralServerSide()
      ? t('page_title_calendar', 'Sharek Calendar')
      : t('page_title_launches', 'Sharek Launches'),
    description: '',
  };
}
export default async function Index() {
  return <LaunchesComponent />;
}
