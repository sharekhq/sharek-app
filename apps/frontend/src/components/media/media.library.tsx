'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { Media } from '@prisma/client';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { libraryPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import {
  MediaLibraryQuery,
  useMediaMonthCount,
  useMonthIds,
} from '@gitroom/frontend/components/media/use.media.library';
import { CheckmarkIcon } from '@gitroom/frontend/components/ui/icons';

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
 * A media library tile, as `MediaBox` shows it on either surface.
 *
 * On the Media page (`standalone`) it is one button over the square that opens
 * the library's preview on its file, over the list the page shows; the play
 * badge takes the end corner. A circle beside it, in the start corner, selects
 * and unselects the file, which then shows a check in the filled circle and a
 * brand frame. While anything is selected every circle shows and the tile
 * button selects and unselects too, instead of opening the preview.
 *
 * In the Media Library window the button picks and unpicks the file, which
 * then shows its number in the order picked and a brand frame. A corner
 * button beside it opens the same preview without touching the picks; the
 * play badge takes the start corner, and the name hides at 1025px and below.
 *
 * Deleting is the preview's, so no tile has a delete button.
 */
export const MediaTile: FC<{
  media: TileMedia & Pick<Media, 'id' | 'name' | 'originalName'>;
  standalone?: boolean;
  /** The list the tile is shown in, which the preview steps through. */
  query: MediaLibraryQuery;
  /** Told the id of each file the preview deletes. */
  onDeleted: (id: string) => void;
  /** The window's: the pick's number, absent while the file isn't picked. */
  order?: number;
  /** The Media page's: the file is selected. */
  selected?: boolean;
  /** The Media page's: anything is selected. */
  selecting?: boolean;
  /** Picks or unpicks the file (the window), selects or unselects it (the page). */
  onToggle?: () => void;
}> = ({
  media,
  standalone,
  query,
  onDeleted,
  order,
  selected,
  selecting,
  onToggle,
}) => {
  const t = useT();
  const modals = useModals();
  // `originalName` is nullable; `name` never is. Without this the name, the
  // tooltip and the alt text are all empty for older uploads.
  const name = media.originalName || media.name;
  const openPreview = () =>
    modals.openModal(libraryPreviewModal(query, media.id, onDeleted));
  return (
    <div className="group rounded-[6px] aspect-square mobile:p-[6px]">
      <div
        className={clsx(
          'w-full h-full rounded-[6px] border-[4px] relative',
          order || selected ? 'border-brand' : 'border-transparent'
        )}
      >
        {/* The tile carries the tooltip, not the name strip: the strip is
            pointer-events-none, so a `title` on it would never be reachable. */}
        <button
          type="button"
          title={name}
          aria-label={name}
          onClick={standalone && !selecting ? openPreview : onToggle}
          className="block w-full h-full rounded-[6px] overflow-hidden relative cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
        >
          <TilePicture
            media={media}
            name={name}
            corner={standalone ? 'end' : 'start'}
          />
          <div
            dir="ltr"
            className={clsx(
              'absolute z-[30] inset-x-0 bottom-0 px-[8px] py-[6px] truncate text-start text-[12px] text-white bg-gradient-to-t from-black/75 to-transparent opacity-0 group-hover:opacity-100 coarse:opacity-100 transition-opacity pointer-events-none',
              !standalone && 'mobile:hidden'
            )}
          >
            {name}
          </div>
        </button>
        {standalone && (
          /* Like the window's expand button: beside the tile button, revealed
             by opacity and hit-tested only once it shows. */
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={!!selected}
            aria-label={t('media_select_named', 'Select {{name}}', { name })}
            className={clsx(
              'cursor-pointer absolute z-[100] top-0 start-0 w-[40px] h-[40px] coarse:w-[44px] coarse:h-[44px] rounded-full flex items-center justify-center transition-opacity focus-visible:ring-2 focus-visible:ring-brand',
              selecting
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto coarse:opacity-100 coarse:pointer-events-auto'
            )}
          >
            <span
              className={clsx(
                'w-[24px] h-[24px] rounded-full border-2 flex items-center justify-center',
                selected
                  ? 'bg-brand border-brand text-white'
                  : 'bg-black/30 border-white'
              )}
            >
              {selected && <CheckmarkIcon aria-hidden="true" />}
            </span>
          </button>
        )}
        {!standalone && (
          /* Beside the tile button, never inside it, and revealed by opacity
             rather than `display`, so it can take focus. An `opacity: 0`
             element is still hit-tested, so it stays `pointer-events-none`
             until it shows; under a finger, where nothing hovers, it always
             shows, and a tap anywhere else on the tile still picks. */
          <button
            type="button"
            onClick={openPreview}
            aria-label={t('open_preview', 'Open preview')}
            className="cursor-pointer absolute z-[100] top-[6px] end-[6px] w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-full flex items-center justify-center text-white bg-black/45 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto coarse:opacity-100 coarse:pointer-events-auto hover:bg-black/[0.68] transition-all focus-visible:ring-2 focus-visible:ring-brand"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 14 14"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 9H0V14H5V12H2V9ZM0 5H2V2H5V0H0V5ZM12 12H9V14H14V9H12V12ZM9 0V2H12V5H14V0H9Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        {!!order && (
          <div className="text-white flex z-[101] justify-center items-center text-[14px] font-[500] w-[24px] h-[24px] rounded-full bg-brand absolute -bottom-[10px] -end-[10px]">
            {order}
          </div>
        )}
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
 *
 * On the Media page the heading ends in "Select all", which asks for every id
 * of the month under the list's type and search, loaded or not, and selects
 * them. It reads "Clear", and unselects them, while every id of the month is
 * selected: the ids its Select all fetched, or, for a month ticked by hand,
 * its loaded files once they are all of its files (research R5).
 */
export const MediaMonth: FC<{
  query: MediaLibraryQuery;
  label: string;
  from: string;
  to: string;
  children: ReactNode;
  /** The Media page's selection; the window has none. */
  selection?: {
    /** The ids of the month's loaded files. */
    ids: string[];
    /** Every id selected, of any month. */
    selected: ReadonlySet<string>;
    /** The ids this month's Select all fetched. */
    fetched?: string[];
    onSelectAll: (ids: string[]) => void;
    onClear: (ids: string[]) => void;
  };
}> = ({ query, label, from, to, children, selection }) => {
  const t = useT();
  const toaster = useToaster();
  const { data } = useMediaMonthCount(query, { from, to });
  const monthIds = useMonthIds();
  // The month's ids, when the page knows them all: what Select all fetched,
  // else the loaded files once they are as many as the count.
  const known =
    selection?.fetched ||
    (data && selection?.ids.length === data.count ? selection.ids : undefined);
  // Those ids while every one of them is selected, for Clear.
  const allSelected =
    known?.length && known.every((id) => selection?.selected.has(id))
      ? known
      : undefined;
  const selectAll = async () => {
    try {
      selection?.onSelectAll(await monthIds(query, { from, to }));
    } catch {
      toaster.show(
        t('error_occurred', 'An error occurred. Please try again.'),
        'warning'
      );
    }
  };
  return (
    <section className="group/month mb-[10px]">
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
        {!!selection && (
          /* Shown by the month's own named group, so hovering a tile never
             reveals the other tiles' `group-hover:` controls. */
          <button
            type="button"
            onClick={
              allSelected ? () => selection.onClear(allSelected) : selectAll
            }
            className={clsx(
              'cursor-pointer ms-auto px-[6px] rounded-[6px] coarse:min-h-[44px] text-[13px] font-[600] text-brandText transition-opacity focus-visible:ring-2 focus-visible:ring-brand',
              selection.selected.size
                ? 'opacity-100'
                : 'opacity-0 group-hover/month:opacity-100 focus-visible:opacity-100 coarse:opacity-100'
            )}
          >
            {allSelected
              ? t('media_clear_selection', 'Clear')
              : t('media_select_all', 'Select all')}
          </button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] 2xl:grid-cols-8 mobile:grid-cols-2 gap-[6px] mobile:gap-0">
        {children}
      </div>
    </section>
  );
};
