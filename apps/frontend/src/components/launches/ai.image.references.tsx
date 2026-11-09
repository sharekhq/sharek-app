import { FC, ReactNode } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';
// media.component renders AiImage, which renders this row: a render-time cycle,
// the one veo3.provider.tsx already closes through ai.video.
import {
  MediaBox,
  mediaLibrarySize,
} from '@gitroom/frontend/components/media/media.component';

type Reference = { id: string; path: string };

/**
 * The AI image window's reference images: Media items the render draws on,
 * numbered in the order they were attached, which is how a prompt names them
 * ("image 2"). Removing one renumbers the rest. Shaped like the Prompt field
 * above it: label, control, then the hint and the counter.
 *
 * Under the edit field it is the edit's images instead: `lead`, the image being
 * edited, is image 1 and cannot be removed, so the images in `value` count
 * from 2. `max` counts only `value`.
 */
export const ReferenceImages: FC<{
  value: Reference[];
  onChange: (value: Reference[]) => void;
  max: number;
  lead?: Reference;
  /** Ends the row of thumbnails: the edit's Apply action. */
  action?: ReactNode;
  /**
   * A brand is picked: the hint says the images take the place of its
   * examples, and, with `logo`, that its logo goes along all the same (spec
   * 053, FR-016).
   */
  branded?: boolean;
  /** The brand's logo is still in Media, so it goes along. */
  logo?: boolean;
}> = ({ value, onChange, max, lead, action, branded, logo }) => {
  const t = useT();
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();
  // In the order the render receives them.
  const images = lead ? [lead, ...value] : value;
  // More than fit: a brand picked after they were attached took a place for
  // its logo. The window holds the render until one is removed, or No brand
  // gives the place back.
  const over = value.length > max;

  // Opened the way MultiMediaComponent opens the library, and limited to the
  // slots left, so a pick that will not fit is refused there with a reason
  // rather than dropped here in silence.
  const pick = () => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: mediaLibrarySize(),
      height: mediaLibrarySize(),
      children: (close) => (
        <MediaBox
          type="image"
          max={max - value.length}
          // An image already attached, or the one being edited, is the same
          // reference, not a second one.
          setMedia={(picked) =>
            onChange([
              ...value,
              ...picked.filter(
                (item) => !images.some((attached) => attached.id === item.id)
              ),
            ])
          }
          closeModal={close}
        />
      ),
    });
  };

  return (
    <div className="flex flex-col gap-[6px]">
      {/* Under the edit field, the field's label names the row too. */}
      {!lead && (
        <div className="text-[14px] font-[600]">
          {t('reference_images', 'Reference images')}
        </div>
      )}
      {/* More room under a coarse pointer: a remove target grown to 44px
          reaches 19px past its thumbnail's top and end, and must land on
          neither the label or field above nor the next tile. */}
      <div
        className={clsx(
          'flex flex-wrap items-end gap-[12px] coarse:gap-[20px] coarse:pt-[13px]',
          lead ? 'pt-[12px] pb-[6px]' : 'py-[6px]'
        )}
      >
        {images.map((reference, index) => (
          <div
            key={reference.id}
            className="relative flex-none w-[64px] h-[64px]"
          >
            <img
              src={mediaDirectory.set(reference.path)}
              alt={t('image_reference_number', 'Reference image {{n}}', {
                n: index + 1,
              })}
              className="w-full h-full object-cover rounded-[8px] border border-line"
            />
            {/* MediaBox's selection badge, lifted off the picture by a ring.
                Hidden from screen readers: the image's alt says the number. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-[6px] -end-[6px] min-w-[20px] h-[20px] px-[5px] rounded-full bg-brand text-white text-[12px] font-[600] leading-none flex items-center justify-center ring-2 ring-surface"
            >
              {index + 1}
            </span>
            {/* The circle stays 22px; under a coarse pointer the button around
                it grows to 44px and its inset shrinks by the same amount, so
                the circle does not move. The image being edited has none: it
                is what the edit changes. */}
            {reference !== lead && (
              <button
                type="button"
                onClick={() =>
                  onChange(value.filter((item) => item.id !== reference.id))
                }
                aria-label={t(
                  'image_reference_remove',
                  'Remove reference image {{n}}',
                  { n: index + 1 }
                )}
                className="group absolute -top-[8px] -end-[8px] w-[22px] h-[22px] coarse:w-[44px] coarse:h-[44px] coarse:-top-[19px] coarse:-end-[19px] flex items-center justify-center rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="w-[22px] h-[22px] rounded-full bg-surface border border-line text-inkSoft group-hover:text-ink group-hover:border-inkSoft flex items-center justify-center transition-colors">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 2l6 6M8 2L2 8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            )}
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={pick}
            className="flex-none h-[64px] min-w-[64px] px-[12px] rounded-[8px] border border-dashed border-line bg-surface text-inkSoft hover:border-inkSoft hover:text-ink flex flex-col items-center justify-center gap-[4px] cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-brand"
          >
            <PlusIcon aria-hidden="true" />
            <span className="text-[12px] font-[600] whitespace-nowrap">
              {t('image_reference_add', 'Add image')}
            </span>
          </button>
        )}
        {action && <div className="ms-auto">{action}</div>}
      </div>
      <div className="text-[12px] flex items-baseline justify-between gap-[10px]">
        <span className="text-muted">
          {lead
            ? t(
                'image_edit_reference_hint',
                "Image 1 is the one you're editing. Add more to bring something in, like a logo."
              )
            : branded && over
            ? t(
                'brands_ref_too_many',
                "Your images don't all fit beside the brand's logo. Remove one, or pick No brand."
              )
            : branded && value.length
            ? logo
              ? t(
                  'brands_ref_help_own',
                  "Your images take the place of the brand's examples; its logo stays.",
                  { count: value.length }
                )
              : t(
                  'brands_ref_help_own_no_logo',
                  "Your images take the place of the brand's examples.",
                  { count: value.length }
                )
            : branded
            ? logo
              ? t(
                  'brands_ref_help',
                  "Optional. Your images take the place of the brand's examples; its logo stays."
                )
              : t(
                  'brands_ref_help_no_logo',
                  "Optional. Your images take the place of the brand's examples."
                )
            : t(
                'image_reference_hint',
                'Optional: add images for the new one to draw on — a character, a product or a look. Refer to them in your prompt as image 1, image 2…'
              )}
        </span>
        {/* Fixed direction, as the prompt's counter has. Counts every image
            the render takes, the one being edited included. Over the limit
            it is in the error tone: unlike the prompt's ceiling, the count
            isn't one the render takes. */}
        <span
          dir="ltr"
          className={clsx(
            'flex-none tabular-nums',
            over ? 'text-error font-[600]' : 'text-muted'
          )}
        >
          {t('prompt_counter', '{{used}} / {{max}}', {
            used: images.length,
            max: max + (lead ? 1 : 0),
          })}
        </span>
      </div>
    </div>
  );
};
