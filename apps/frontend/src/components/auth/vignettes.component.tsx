'use client';

import { FC } from 'react';
import clsx from 'clsx';
import SafeImage from '@gitroom/react/helpers/safe.image';

// Six captures of the product doing the thing the headline claims, in the
// language the page is being read in — they replaced sixteen testimonials
// attributed to people who were never our customers. Each keeps its own height:
// they are not a uniform crop, and a column that reserves the wrong space still
// jumps when the image decodes.
const columns = [
  [
    { slug: '01-brainstorm', height: 500 },
    { slug: '02-refine-tone', height: 600 },
    { slug: '03-generate-images', height: 600 },
  ],
  [
    { slug: '04-generate-video', height: 600 },
    { slug: '05-schedule-samy', height: 600 },
    { slug: '06-dashboard', height: 347 },
  ],
];

export const VignettesComponent: FC<{ language: string }> = ({ language }) => {
  // Only two sets were captured, so every Latin-script locale reads the English
  // one — the same fallback the copy itself takes.
  const set = language === 'ar' ? 'ar' : 'en';

  return (
    <div className="flex-1 relative w-full my-[30px] max-w-[850px]">
      <div className="absolute w-full h-full left-0 top-0 px-[40px] overflow-hidden">
        <div className="absolute w-full h-[120px] left-0 top-0 blackGradTopBg z-[100]" />
        <div className="absolute w-full h-[120px] left-0 bottom-0 blackGradBottomBg z-[100]" />
        <div className="flex justify-center gap-[12px]">
          {/* Motion is answered by the reduced-motion block at global.scss:926,
              which near-disables every animation on the page, marquees named in
              its own comment. */}
          {columns.map((column, index) => (
            <div
              key={index}
              className={clsx(
                'flex flex-col flex-1 gap-[12px]',
                index === 0 ? 'animate-marqueeUp' : 'animate-marqueeDown'
              )}
            >
              {/* The track carries the column twice: the keyframes translate by
                  half of it, so the second pass is what closes the loop. */}
              {[1, 2].flatMap((pass) =>
                column.map(({ slug, height }) => (
                  <div
                    key={`${pass}_${slug}`}
                    className="rounded-[16px] overflow-hidden border border-[#2b2a2a]"
                  >
                    {/* Decorative: the headline beside them carries the claim,
                        and alt text here would be English in every language —
                        the failure this screen is being cleared of. */}
                    <SafeImage
                      className="w-full h-auto block"
                      src={`/auth/vignettes/${slug}-${set}.webp`}
                      alt=""
                      width={800}
                      height={height}
                    />
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
