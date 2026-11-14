'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Media } from '@prisma/client';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { libraryPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import {
  MediaLibraryQuery,
  useMediaMonthCount,
} from '@gitroom/frontend/components/media/use.media.library';

/** What a tile reads of a library row: the original, and its tile image when the storage made one. */
type TileMedia = Pick<Media, 'path'> & { tileImage?: string };

/**
 * The file inside a media library tile, shown whole on the recess.
 *
 * A row with a tile image loads that small copy. When it fails, an image falls
 * back to its original, once, and a video to a neutral placeholder: a tile
 * never loads a video to make up for a missing still. A row without a tile
 * image is drawn from its original, as before tile images existed.
 *
 * The play badge marks a video and carries no length. It is `aria-hidden`:
 * decoration over the file, which the name already identifies.
 */
export const TilePicture: FC<{
  media: TileMedia;
  name: string;
  corner?: 'start' | 'end';
}> = ({ media, name, corner = 'start' }) => {
  const mediaDirectory = useMediaDirectory();
  const [failed, setFailed] = useState(false);
  const original = mediaDirectory.set(media.path);
  const video = hasExtension(media.path, 'mp4');
  return (
    <div className="relative w-full h-full bg-panel">
      {video && !media.tileImage ? (
        <VideoFrame url={original} className="w-full h-full object-contain" />
      ) : video && failed ? (
        <div
          role="img"
          aria-label={name}
          className="w-full h-full flex items-center justify-center text-muted"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      ) : (
        <img
          className="w-full h-full object-contain"
          src={media.tileImage && !failed ? media.tileImage : original}
          loading="lazy"
          decoding="async"
          alt={name}
          onError={() => setFailed(true)}
        />
      )}
      {video && (
        <div
          aria-hidden="true"
          className={clsx(
            'absolute z-[30] top-[6px] pointer-events-none flex items-center h-[20px] px-[6px] rounded-[4px] bg-black/60 text-white',
            corner === 'end' ? 'end-[6px]' : 'start-[6px]'
          )}
        >
          <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
            <path
              d="M6.5 3.567a.5.5 0 0 1 0 .866L.75 7.763A.5.5 0 0 1 0 7.33V.67A.5.5 0 0 1 .75.237L6.5 3.567Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

/**
 * A media library tile on the Media page (`standalone`, as `MediaBox` has it):
 * one button over the square that opens the library's preview on its file,
 * over the list the page shows. Deleting is the preview's, so the tile has no
 * corner buttons, and the play badge takes the end corner.
 */
export const MediaTile: FC<{
  media: TileMedia & Pick<Media, 'id' | 'name' | 'originalName'>;
  standalone?: boolean;
  /** The list the tile is shown in, which the preview steps through. */
  query: MediaLibraryQuery;
  /** Told the id of each file the preview deletes. */
  onDeleted: (id: string) => void;
}> = ({ media, query, onDeleted }) => {
  const modals = useModals();
  // `originalName` is nullable; `name` never is. Without this the name, the
  // tooltip and the alt text are all empty for older uploads.
  const name = media.originalName || media.name;
  return (
    <div className="group rounded-[6px] aspect-square mobile:p-[6px]">
      <div className="w-full h-full rounded-[6px] border-[4px] border-transparent relative">
        {/* The tile carries the tooltip, not the name strip: the strip is
            pointer-events-none, so a `title` on it would never be reachable. */}
        <button
          type="button"
          title={name}
          aria-label={name}
          onClick={() =>
            modals.openModal(libraryPreviewModal(query, media.id, onDeleted))
          }
          className="block w-full h-full rounded-[6px] overflow-hidden relative cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          <TilePicture media={media} name={name} corner="end" />
          <div
            dir="ltr"
            className="absolute z-[30] inset-x-0 bottom-0 px-[8px] py-[6px] truncate text-start text-[12px] text-white bg-gradient-to-t from-black/75 to-transparent opacity-0 group-hover:opacity-100 coarse:opacity-100 transition-opacity pointer-events-none"
          >
            {name}
          </div>
        </button>
      </div>
    </div>
  );
};

/**
 * A month of the media library: a heading with the month's name and how many
 * files it holds under the list's type and search, over its tiles on today's
 * grid.
 *
 * The heading is sticky inside the month's own section, so it stays at the top
 * while the month's tiles scroll under it, until the next month's heading
 * pushes it up. It sits above the tiles' controls and never moves; only the
 * count's skeleton bar pulses until the count answers.
 */
export const MediaMonth: FC<{
  query: MediaLibraryQuery;
  label: string;
  from: string;
  to: string;
  children: ReactNode;
}> = ({ query, label, from, to, children }) => {
  const t = useT();
  const { data } = useMediaMonthCount(query, { from, to });
  return (
    <section className="mb-[10px]">
      <div className="sticky top-0 z-[110] flex items-baseline gap-[10px] py-[10px] bg-newBgColorInner">
        <h2 className="text-[16px] font-[600]">{label}</h2>
        {data ? (
          <span className="text-[13px] text-muted">
            {t('media_month_files', '{{value}} files', {
              count: data.count,
              value: data.count.toLocaleString('en-US'),
            })}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="w-[56px] h-[12px] rounded-[4px] bg-newSep animate-pulse"
          />
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] 2xl:grid-cols-8 mobile:grid-cols-2 gap-[6px] mobile:gap-0">
        {children}
      </div>
    </section>
  );
};
