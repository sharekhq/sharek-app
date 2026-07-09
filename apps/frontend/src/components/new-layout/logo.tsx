'use client';

import { LogoMark } from '@gitroom/frontend/components/ui/logo-mark';

export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="60"
      height="60"
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Sharek"
      className="mt-[8px] min-w-[60px] min-h-[60px]"
    >
      <LogoMark />
    </svg>
  );
};
