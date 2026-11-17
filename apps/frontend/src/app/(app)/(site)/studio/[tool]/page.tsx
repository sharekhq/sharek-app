import { StudioToolLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.studio.tool.component';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_studio', 'Sharek Studio'),
    description: '',
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  return <StudioToolLayoutComponent tool={tool} />;
}
