'use client';

import { LogoMark } from '@gitroom/frontend/components/ui/logo-mark';

export const Logo = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Sharek"
      className="mt-[8px] min-w-[48px] min-h-[48px]"
    >
      <LogoMark />
    </svg>
  );
};
