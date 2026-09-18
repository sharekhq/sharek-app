export const dynamic = 'force-dynamic';
import { ForgotReturn } from '@gitroom/frontend/components/auth/forgot-return';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_forgot_password', 'Sharek Forgot Password'),
    description: '',
  };
}
export default async function Auth(params: {
  params: Promise<{
    token: string;
  }>;
}) {
  return <ForgotReturn token={(await params.params).token} />;
}
