'use client';

import { FC, SyntheticEvent, useState } from 'react';
import clsx from 'clsx';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import {
  Brand,
  liveLogo,
} from '@gitroom/frontend/components/brands/use.brands';
import {
  LOGO_TILE_DARK,
  LOGO_TILE_LIGHT,
} from '@gitroom/frontend/components/brands/brand.website';

export type LogoTone = 'light' | 'dark' | null;

// A logo's tone, read on a SAMPLE × SAMPLE copy of it (research R1): a pixel
// is visible from alpha SEE_THROUGH up; a logo with under OPAQUE_SHARE of its
// pixels see-through has its own background; a visible pixel is light from
// luminance LIGHT_Y up and dark from DARK_Y down; NEARLY_ALL of the visible
// pixels decide.
const SAMPLE = 32;
const SEE_THROUGH = 128;
const OPAQUE_SHARE = 0.01;
const LIGHT_Y = 0.5;
const DARK_Y = 0.1;
const NEARLY_ALL = 0.9;

// WCAG's relative luminance of an sRGB colour, each channel 0 to 255.
const luminance = (r: number, g: number, b: number) => {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

// 'light' or 'dark' for a logo nearly all one or the other on a see-through
// ground; null for a coloured, mixed or empty one, or one with its own
// background. pixels: RGBA quadruples, as getImageData gives them.
export const logoTone = (pixels: ArrayLike<number>): LogoTone => {
  let seeThrough = 0;
  let light = 0;
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < SEE_THROUGH) {
      seeThrough++;
      continue;
    }
    const y = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (y >= LIGHT_Y) {
      light++;
    } else if (y <= DARK_Y) {
      dark++;
    }
  }
  const total = pixels.length / 4;
  const visible = total - seeThrough;
  if (!visible || seeThrough < total * OPAQUE_SHARE) {
    return null;
  }
  if (light >= visible * NEARLY_ALL) {
    return 'light';
  }
  return dark >= visible * NEARLY_ALL ? 'dark' : null;
};

// Each logo's tone once read, by src, so a mark mounted later draws its tile
// from the first render.
const tones = new Map<string, LogoTone>();

// A loaded logo's tone, read on a SAMPLE × SAMPLE canvas; null where the
// browser gives no 2D context or refuses the pixels.
const readTone = (img: HTMLImageElement): LogoTone => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    return logoTone(context.getImageData(0, 0, SAMPLE, SAMPLE).data);
  } catch {
    return null;
  }
};

// A brand's logo, on a tile that follows its tone: a light logo on the dark
// one, a dark logo on the light one, any other on the initial's. Asked for
// with CORS so its pixels can be read; where that request fails it loads
// again without, and keeps the initial's tile.
const LogoMark: FC<{ src: string; className: string }> = ({
  src,
  className,
}) => {
  const [cors, setCors] = useState(true);
  const [tone, setTone] = useState<LogoTone>(() => tones.get(src) ?? null);

  const read = (event: SyntheticEvent<HTMLImageElement>) => {
    if (!cors) {
      return;
    }
    const found = readTone(event.currentTarget);
    tones.set(src, found);
    setTone(found);
  };

  const fallBack = () => setCors(false);

  return (
    <img
      src={src}
      alt=""
      crossOrigin={cors ? 'anonymous' : undefined}
      onLoad={read}
      onError={fallBack}
      className={clsx(
        'flex-none object-contain p-[3px] bg-surface2',
        className
      )}
      style={
        tone === 'light'
          ? LOGO_TILE_DARK
          : tone === 'dark'
          ? LOGO_TILE_LIGHT
          : undefined
      }
    />
  );
};

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
      <LogoMark
        key={logo.path}
        src={mediaDirectory.set(logo.path)}
        className={className}
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
