'use client';

import { LogoMark } from '@gitroom/frontend/components/ui/logo-mark';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const Logo = () => {
  const t = useT();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label={t('logo_brand_name', 'Sharek')}
      className="mt-[8px] min-w-[48px] min-h-[48px]"
    >
      <LogoMark />
    </svg>
  );
};
