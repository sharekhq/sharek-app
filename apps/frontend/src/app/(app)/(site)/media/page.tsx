import { MediaLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_media', 'Sharek Media'),
    description: '',
  };
}

export default async function Page() {
  return <MediaLayoutComponent />
}
