'use client';

import { FC, useCallback, useState } from 'react';
import { Media } from '@prisma/client';
import { useHotkeys } from 'react-hotkeys-hook';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { formatDuration } from '@gitroom/helpers/utils/format.duration';
import {
  MediaStepDirection,
  stepMediaIndex,
} from '@gitroom/helpers/utils/step.media.index';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ModalHeaderSlot } from '@gitroom/frontend/components/layout/new-modal';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from '@gitroom/frontend/components/ui/icons';

/**
 * What the browser reports once it has the item, tagged with the item it
 * describes — so stepping to the next file can never leave the previous file's
 * dimensions in the header.
 */
interface LoadedMetadata {
  id: string;
  width: number;
  height: number;
  duration?: number;
}

/**
 * The media library's lightbox. It fetches nothing: the grid hands it the page
 * it already loaded, and a start position within it.
 *
 * The card is sized against the viewport by the modal options the grid opens it
 * with, so the media letterboxes into a fixed stage rather than sizing the card
 * itself — stepping between a 9:16 and a 16:9 item moves nothing.
 */
export const MediaPreview: FC<{
  /** The current page's media, already filtered. Never empty. */
  items: Media[];
  /** Start position within `items`. 0 <= index < items.length. */
  index: number;
}> = ({ items, index }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  const [current, setCurrent] = useState(index);
  const [loaded, setLoaded] = useState<LoadedMetadata>();

  const media = items[current];
  const url = mediaDirectory.set(media.path);
  const metadata = loaded?.id === media.id ? loaded : undefined;
  const length = formatDuration(metadata?.duration ?? NaN);

  const step = useCallback(
    (direction: MediaStepDirection) =>
      setCurrent((position) =>
        stepMediaIndex({
          current: position,
          total: items.length,
          direction,
          rtl: document.dir === 'rtl',
        })
      ),
    [items.length]
  );

  const stepOnKey = useCallback(
    (direction: MediaStepDirection) => (event: KeyboardEvent) => {
      // A focused video owns the arrow keys for seeking; stepping the library
      // out from under a scrub is not what the press meant.
      if ((event.target as HTMLElement)?.tagName === 'VIDEO') {
        return;
      }
      step(direction);
    },
    [step]
  );

  useHotkeys('ArrowLeft', stepOnKey('left'), [stepOnKey]);
  useHotkeys('ArrowRight', stepOnKey('right'), [stepOnKey]);

  const control =
    'absolute z-[10] top-[50%] -translate-y-[50%] w-[40px] h-[40px] rounded-full flex items-center justify-center text-white bg-black/45 hover:bg-black/[0.68] transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <>
      <ModalHeaderSlot>
        {/* Clears the modal's own absolutely positioned close button. */}
        <div className="flex items-baseline gap-[12px] pe-[44px] text-[16px] font-[600]">
          <div className="min-w-0 truncate" dir="ltr" title={media.originalName}>
            {media.originalName}
          </div>
          <div className="flex-1 flex items-baseline justify-end gap-[12px] text-[13px] font-[400] text-muted whitespace-nowrap">
            {/* A phone has no room for these beside the close button — the
                untrimmed header wraps to two lines at 390px. */}
            {!!metadata && (
              <span dir="ltr" className="phone:hidden">
                {metadata.width} × {metadata.height}
                {!!length && ` · ${length}`}
              </span>
            )}
            <span dir="ltr" className="phone:hidden">
              {current + 1} / {items.length}
            </span>
            {/* Not "Download": `media.path` is a full URL on another origin, so
                the browser would ignore a `download` attribute and open a tab
                anyway. */}
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={t('open_original', 'Open original')}
              className="flex items-center rounded-[6px] hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="phone:hidden">
                {t('open_original', 'Open original')}
              </span>
              <ExternalLinkIcon size={16} className="hidden phone:block" />
            </a>
          </div>
        </div>
      </ModalHeaderSlot>

      {/* The media fills the stage as an absolutely positioned box and
          letterboxes inside it with `object-contain`. It must not be sized with
          `max-h-full`: that percentage resolves against the stage's flex height,
          which is indefinite while the stage is being laid out, so the
          constraint drops and the media sizes the card instead — a 9:16 item
          then makes the card 1877px tall. Measured across five viewports. */}
      <div className="flex-1 relative flex items-center justify-center bg-surface2 rounded-[12px] overflow-hidden">
        {hasExtension(media.path, 'mp4') ? (
          <VideoFrame
            key={media.id}
            url={url}
            autoplay={true}
            controls={true}
            playsInline={true}
            className="absolute inset-0 w-full h-full object-contain"
            onLoadedMetadata={(video) =>
              setLoaded({
                id: media.id,
                width: video.videoWidth,
                height: video.videoHeight,
                duration: video.duration,
              })
            }
          />
        ) : (
          <img
            key={media.id}
            className="absolute inset-0 w-full h-full object-contain"
            src={url}
            alt={media.originalName}
            onLoad={(e) =>
              setLoaded({
                id: media.id,
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
        )}

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step('previous')}
              disabled={current === 0}
              aria-label={t('previous', 'Previous')}
              className={`${control} start-[16px]`}
            >
              <ChevronLeftIcon size={20} className="rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => step('next')}
              disabled={current === items.length - 1}
              aria-label={t('next', 'Next')}
              className={`${control} end-[16px]`}
            >
              <ChevronRightIcon size={20} className="rtl:rotate-180" />
            </button>
          </>
        )}
      </div>
    </>
  );
};
