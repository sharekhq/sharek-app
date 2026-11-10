'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import SafeImage from '@gitroom/react/helpers/safe.image';
import {
  Brand,
  liveLogo,
} from '@gitroom/frontend/components/brands/use.brands';

// A brand's logo, or its initial while it has none or the logo was deleted
// from Media. Decoration: the brand's name is beside it. The Brands page's
// and the brand list's (brand.menu.tsx); each gives its size. The logo fits
// inside the square, inset on the initial's tile, so a wide one keeps the
// mark's shape rather than becoming a sliver on the page.
export const BrandMark: FC<{ brand: Brand; className: string }> = ({
  brand,
  className,
}) => {
  const mediaDirectory = useMediaDirectory();
  const logo = liveLogo(brand);

  if (logo) {
    return (
      <SafeImage
        src={mediaDirectory.set(logo.path)}
        alt=""
        className={clsx(
          'flex-none object-contain p-[3px] bg-surface2',
          className
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={clsx(
        'flex-none flex items-center justify-center bg-surface2 text-inkSoft font-[700]',
        className
      )}
    >
      {[...brand.name][0]?.toUpperCase()}
    </span>
  );
};

// No brand's crossed circle, on its mark and on Samy's brand chip.
// Decoration, as No brand's name is beside it.
export const NoBrandIcon: FC<{ size: number; className?: string }> = ({
  size,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M6.5 17.5l11-11" />
  </svg>
);

// No brand's mark: an empty dashed tile with a crossed circle.
export const NoBrandMark: FC<{ className: string; size: number }> = ({
  className,
  size,
}) => (
  <span
    aria-hidden="true"
    className={clsx(
      'flex-none flex items-center justify-center border-[1.5px] border-dashed border-line text-muted',
      className
    )}
  >
    <NoBrandIcon size={size} />
  </span>
);
