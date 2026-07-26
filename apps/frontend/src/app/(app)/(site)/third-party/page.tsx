import { ThirdPartyComponent } from '@gitroom/frontend/components/third-parties/third-party.component';

export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${
    isGeneralServerSide() ? 'Sharek Integrations' : 'Sharek Integrations'
  }`,
  description: '',
};
export default async function Index() {
  if (!process.env.SHOW_THIRD_PARTY) {
    return redirect('/launches');
  }
  return <ThirdPartyComponent />;
}
