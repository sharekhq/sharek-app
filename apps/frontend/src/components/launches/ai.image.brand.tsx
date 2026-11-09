import { FC, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  BrandKitPart,
  ImageBrandRefusal,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import { NO_BRAND } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';
import { ChevronDownIcon } from '@gitroom/frontend/components/ui/icons';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { isolate } from '@gitroom/frontend/components/launches/helpers/platform-label';
import { BrandMenu } from '@gitroom/frontend/components/brands/brand.menu';
import {
  BrandMark,
  NoBrandMark,
} from '@gitroom/frontend/components/brands/brand.mark';
import {
  Brand,
  liveExamples,
  liveLogo,
  useBrands,
} from '@gitroom/frontend/components/brands/use.brands';

// A brand's kit is named by the brand, isolated so the name's own direction
// can't reorder the sentence around it, and one of its images by its part of
// the kit and an example's number on the Brands page (spec 053).
type KitNames = {
  brand: string;
  n?: number;
  interpolation: { escapeValue: false };
};

/**
 * One of a brand's kit images, refused for a reference's reason. It has no
 * thumbnail, so it is named by its part of the kit rather than a number.
 */
const kitImageRefusal = (
  t: ReturnType<typeof useT>,
  code: ImageBrandRefusal | undefined,
  part: BrandKitPart,
  names: KitNames
) => {
  if (part === 'logo') {
    switch (code) {
      case 'reference_missing':
        return t(
          'brands_refused_logo_missing',
          "{{brand}}'s logo is no longer in your Media library. Replace it on the Brands page, or pick No brand.",
          names
        );
      case 'reference_unreadable':
        return t(
          'brands_refused_logo_unreadable',
          "{{brand}}'s logo can't be used — its file format isn't supported. Replace it on the Brands page, or pick No brand.",
          names
        );
      case 'reference_too_large':
        return t(
          'brands_refused_logo_too_large',
          "{{brand}}'s logo is larger than 30 MB. Replace it on the Brands page, or pick No brand.",
          names
        );
    }
    return;
  }
  switch (code) {
    case 'reference_missing':
      return t(
        'brands_refused_example_missing',
        "{{brand}}'s example post {{n}} is no longer in your Media library. Replace it on the Brands page, or pick No brand.",
        names
      );
    case 'reference_unreadable':
      return t(
        'brands_refused_example_unreadable',
        "{{brand}}'s example post {{n}} can't be used — its file format isn't supported. Replace it on the Brands page, or pick No brand.",
        names
      );
    case 'reference_too_large':
      return t(
        'brands_refused_example_too_large',
        "{{brand}}'s example post {{n}} is larger than 30 MB. Replace it on the Brands page, or pick No brand.",
        names
      );
  }
};

// What a render route answers when the brand keeps a render from starting:
// its code, the brand's name, and for one of its kit images, its part of the
// kit and an example's number.
export type BrandRefusal = {
  code?: ImageBrandRefusal;
  brand?: string;
  part?: BrandKitPart;
  n?: number;
};

/**
 * A refusal of the brand picked or of its kit, said in the window's language
 * rather than the server's English, as a reference's is (research R13): one
 * of the kit's images, more of the user's images than fit beside the logo, or
 * a brand deleted since it was picked. Any other refusal has none here.
 */
export const brandRefusal = (
  t: ReturnType<typeof useT>,
  payload: BrandRefusal | null
) => {
  const names: KitNames = {
    brand: isolate(payload?.brand),
    n: payload?.n,
    interpolation: { escapeValue: false },
  };
  // A kit image carries a reference's code and no number, so its part of the
  // kit is read first.
  if (payload?.part) {
    return kitImageRefusal(t, payload.code, payload.part, names);
  }
  switch (payload?.code) {
    case 'brand_logo_place':
      return t(
        'brands_refused_logo_place',
        "With {{brand}}'s logo, only 3 of your images fit (2 when editing). Remove one, or pick No brand.",
        names
      );
    case 'brand_missing':
      return t(
        'brands_refused_brand_missing',
        'That brand no longer exists. Pick another or No brand.'
      );
  }
};

// The brand picked last in this browser (research R13): a per-viewer
// convenience, so storage the browser refuses leaves the window on No brand.
const BRAND_KEY = 'aiImageBrand';

const rememberedBrand = () => {
  try {
    return localStorage.getItem(BRAND_KEY);
  } catch {
    return null;
  }
};

/**
 * The window's brand (spec 053, US5): the organization's brands, the one
 * picked, and a pick, which this browser keeps for the next time the window
 * opens.
 */
export const useImageBrand = () => {
  const { data: brands = [] } = useBrands();
  // The brand picked, by its id; null for No brand.
  const [brandId, setBrandId] = useState(rememberedBrand);

  const pickBrand = (choice: string) => {
    const id = choice === NO_BRAND ? null : choice;
    setBrandId(id);
    try {
      if (id) {
        localStorage.setItem(BRAND_KEY, id);
      } else {
        localStorage.removeItem(BRAND_KEY);
      }
    } catch {
      // Refused: the pick holds while the window is open.
    }
  };

  return {
    brands,
    // The window starts on the brand picked last while it is still one of the
    // organization's, else on No brand, as it is while the brands load
    // (FR-025). Only this brand goes with a render.
    brand: brands.find((item) => item.id === brandId),
    pickBrand,
  };
};

// A kit image after "Goes along:" (board StudioBrand).
const KIT_THUMBNAIL =
  'flex-none w-[36px] h-[36px] rounded-[8px] border border-line';

/**
 * The Brand field under the prompt (spec 053, US5; board StudioBrand): the
 * brand list titled for an image, opened from a box that shows the brand
 * picked, and beside it what goes along: the brand's logo and its examples
 * still in Media. The examples fade once the user's own images take their
 * place; the logo goes along either way. A brand with no image to send shows
 * nothing beside the box, its colours and fonts going as words.
 */
export const BrandField: FC<{
  brands: Brand[];
  // the brand picked; none for No brand
  brand?: Brand;
  // the user has attached images of their own
  own: boolean;
  onPick: (choice: string) => void;
}> = ({ brands, brand, own, onPick }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  const name = brand ? brand.name : t('brands_no_brand', 'No brand');
  const logoPath = liveLogo(brand)?.path;
  const examples = liveExamples(brand);

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[14px] font-[600]">
        {t('select_customer_label', 'Brand')}
      </div>
      <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
        <div className="w-[340px] max-w-full">
          <BrandMenu
            brands={brands}
            value={brand ? brand.id : NO_BRAND}
            variant="image"
            onPick={onPick}
            label={t(
              'brands_field_label',
              'Brand for this image: {{brand}}. Change brand',
              { brand: isolate(name), interpolation: { escapeValue: false } }
            )}
            trigger={
              <>
                {brand ? (
                  <BrandMark
                    brand={brand}
                    className="w-[24px] h-[24px] rounded-[6px] text-[11px]"
                  />
                ) : (
                  <NoBrandMark
                    className="w-[24px] h-[24px] rounded-[6px]"
                    size={12}
                  />
                )}
                <span
                  dir={brand ? 'auto' : undefined}
                  className="flex-1 min-w-0 truncate"
                >
                  {name}
                </span>
                <ChevronDownIcon
                  size={16}
                  aria-hidden="true"
                  className="flex-none text-muted"
                />
              </>
            }
            triggerClassName="flex-1 min-w-0 h-[44px] flex items-center gap-[10px] px-[12px] bg-surface border border-line rounded-[8px] text-[14px] text-ink text-start cursor-pointer hover:border-inkSoft aria-expanded:border-brand transition-colors focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>
        {(logoPath || examples.length > 0) && (
          <div className="flex items-center gap-[6px] text-[12px] text-muted">
            <span>{t('brands_goes_along', 'Goes along:')}</span>
            {logoPath && (
              <SafeImage
                src={mediaDirectory.set(logoPath)}
                alt={t('brands_logo', 'Logo')}
                className={clsx(KIT_THUMBNAIL, 'object-contain')}
              />
            )}
            {examples.length > 0 && (
              <span
                role="img"
                aria-label={t('brands_example_posts', 'Example posts')}
                className="flex gap-[6px]"
              >
                {examples.map((example) => (
                  <SafeImage
                    key={example.id}
                    src={mediaDirectory.set(example.path)}
                    alt=""
                    className={clsx(
                      KIT_THUMBNAIL,
                      'object-cover',
                      own && 'opacity-30 grayscale'
                    )}
                  />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
