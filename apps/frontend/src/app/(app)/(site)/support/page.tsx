import { SupportComponent } from '@gitroom/frontend/components/support/support.component';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isSupportConfigured } from '@gitroom/helpers/utils/is.support.configured';
export const metadata: Metadata = {
  title: `Sharek Support`,
  description: '',
};
export default async function Index() {
  // Unconfigured has to be invisible rather than broken: no dead entry in the
  // navigation, and no page that loads only to fail on submit.
  if (!isSupportConfigured()) {
    return redirect('/launches');
  }
  return <SupportComponent />;
}
