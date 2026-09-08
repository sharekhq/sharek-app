import { StudioLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.studio.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Sharek' : 'Sharek'} Studio`,
  description: '',
};

export default async function Page() {
  return <StudioLayoutComponent />
}
