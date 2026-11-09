import { BrandsComponent } from '@gitroom/frontend/components/brands/brands.component';
import { Metadata } from 'next';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('page_title_brands', 'Sharek Brands'),
    description: '',
  };
}

export default async function Page() {
  return <BrandsComponent />;
}
