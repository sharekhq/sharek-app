'use client';

import { FC, Fragment, ReactElement, useCallback, useState } from 'react';
import { Media } from '@prisma/client';
import { useHotkeys } from 'react-hotkeys-hook';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { formatDuration } from '@gitroom/helpers/utils/format.duration';
import { formatAspectRatio } from '@gitroom/helpers/utils/format.aspect.ratio';
import {
  MediaStepDirection,
  stepMediaIndex,
} from '@gitroom/helpers/utils/step.media.index';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ModalHeaderSlot,
  ModalHeaderSlotTarget,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import {
  MediaLibraryQuery,
  useDeleteMedia,
  useMediaLibrary,
  useRefreshMediaLibrary,
} from '@gitroom/frontend/components/media/use.media.library';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  TrashIcon,
} from '@gitroom/frontend/components/ui/icons';

/** What the viewer reads of a Media row. */
type PreviewItem = Pick<Media, 'id' | 'name' | 'path'> &
  Partial<Pick<Media, 'originalName' | 'createdAt'>>;

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
 * The media library's lightbox. It fetches nothing: its caller hands it the
 * files it has loaded, and a start position within them.
 *
 * The card is sized against the viewport by the modal options it opens with,
 * so the media letterboxes into a fixed stage rather than sizing the card
 * itself — stepping between a 9:16 and a 16:9 item moves nothing.
 */
export const MediaPreview: FC<{
  /** The files loaded so far. Never empty when the viewer opens. */
  items: PreviewItem[];
  /** Start position within `items`. 0 <= index < items.length. */
  index: number;
  /** More files follow the loaded ones, which `loadMore` asks for. */
  hasMore?: boolean;
  loadMore?: () => void;
  /** Deletes the file; resolves to whether it went. Adds the footer. */
  onDelete?: (item: PreviewItem) => Promise<boolean>;
}> = ({ items, index, hasMore = false, loadMore, onDelete }) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  const { closeCurrent } = useModals();
  // The file shown, by id, so a reload in another order or a delete can't move
  // the viewer onto another file; and where it stood when it was last placed.
  const [shown, setShown] = useState(() => ({
    id: items[index].id,
    position: index,
  }));
  // The file a step forward is waiting to leave, while the files after it load.
  const [waiting, setWaiting] = useState<string>();
  const [loaded, setLoaded] = useState<LoadedMetadata>();

  // The files a step forward waited for have arrived: it moves on to the first.
  // Set during render, as the app shell's drawer is, so no commit shows the
  // file it was waiting to leave.
  const from = items.findIndex((item) => item.id === waiting);
  if (from !== -1 && from < items.length - 1) {
    setWaiting(undefined);
    setShown({ id: items[from + 1].id, position: from + 1 });
  }

  const found = items.findIndex((item) => item.id === shown.id);
  // A file that left the list (it was deleted) gives its place to the one after
  // it, or, when it was the last, to the one before.
  const position =
    found === -1 ? Math.min(shown.position, items.length - 1) : found;
  const media: PreviewItem | undefined = items[position];

  const step = useCallback(
    (direction: MediaStepDirection) => {
      if (!media) {
        return;
      }
      // While more can load, the place past the loaded files stands for them:
      // stepping onto it loads them, once, and the viewer moves on when they
      // arrive.
      const to = stepMediaIndex({
        current: position,
        total: items.length + (hasMore ? 1 : 0),
        direction,
        rtl: document.dir === 'rtl',
      });
      if (to < items.length) {
        setWaiting(undefined);
        setShown({ id: items[to].id, position: to });
      } else if (waiting !== media.id) {
        setWaiting(media.id);
        loadMore?.();
      }
    },
    [media, position, items, hasMore, loadMore, waiting]
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

  const remove = useCallback(async () => {
    if (!media || !onDelete) {
      return;
    }
    if (
      !(await deleteDialog(
        t('media_delete_body', "It'll be removed from your media library.", {
          count: 1,
          value: '1',
        }),
        t('delete', 'Delete'),
        t('media_delete_title', 'Delete this file?', {
          count: 1,
          value: '1',
        }),
        t('cancel', 'Cancel'),
        true
      ))
    ) {
      return;
    }
    if (!(await onDelete(media))) {
      return;
    }
    // Where it stood, for the file that takes its place once it leaves the
    // list. What comes next is read off the files as they stood when Delete
    // was pressed: the dialog let nothing else change them.
    setShown({ id: media.id, position });
    const rest = items.filter((item) => item.id !== media.id);
    if (rest.length > position) {
      return;
    }
    if (hasMore) {
      loadMore?.();
    } else if (!rest.length) {
      closeCurrent();
    }
  }, [media, onDelete, position, items, hasMore, loadMore, closeCurrent, t]);

  // The refetch after a delete can drop the file before onDelete answers.
  if (!media) {
    return null;
  }

  // `originalName` is nullable; `name` never is. Without the fallback a
  // nameless item renders a blank header, and the title row collapses from
  // 24px to 20px, shifting the stage as you step onto it.
  const displayName = media.originalName || media.name;
  const url = mediaDirectory.set(media.path);
  const isVideo = hasExtension(media.path, 'mp4');
  const metadata = loaded?.id === media.id ? loaded : undefined;
  // Undefined until the file has loaded, and for good when it fails to.
  const shape = metadata && formatAspectRatio(metadata.width, metadata.height);
  const length = formatDuration(metadata?.duration ?? NaN);
  const details = [
    !!metadata && !!shape && (
      <bdi dir="ltr">
        {metadata.width} × {metadata.height}
      </bdi>
    ),
    !!shape && <bdi dir="ltr">{shape}</bdi>,
    isVideo && (
      <>
        {t('media_preview_video', 'Video')}
        {!!length && (
          <>
            {' '}
            <bdi dir="ltr">{length}</bdi>
          </>
        )}
      </>
    ),
    !!media.createdAt && newDayjs(media.createdAt).format('D MMM YYYY'),
  ].filter(Boolean);

  const control =
    'absolute z-[10] top-[50%] -translate-y-[50%] w-[40px] h-[40px] coarse:w-[44px] coarse:h-[44px] rounded-full flex items-center justify-center text-white bg-black/45 hover:bg-black/[0.68] transition-colors disabled:opacity-30 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <>
      <ModalHeaderSlot>
        {/* Clears the modal's own absolutely positioned close button. */}
        <div className="flex items-center gap-[12px] pe-[44px]">
          <div className="flex-1 min-w-0">
            <div
              className="truncate text-[16px] font-[600]"
              dir="ltr"
              title={displayName}
            >
              {displayName}
            </div>
            {/* Under the name on every width, a phone's included. The line
                keeps its height while it is empty, so the stage doesn't move
                when the file loads. */}
            <div className="h-[18px] truncate text-[13px] leading-[18px] font-[400] text-muted">
              {details.map((detail, at) => (
                <Fragment key={at}>
                  {at > 0 && ' · '}
                  {detail}
                </Fragment>
              ))}
            </div>
          </div>
          {/* Not "Download": `media.path` is a full URL on another origin, so
              the browser would ignore a `download` attribute and open a tab
              anyway. */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={t('open_original', 'Open original')}
            className="cursor-pointer shrink-0 h-[30px] coarse:min-h-[44px] coarse:min-w-[44px] px-[8px] rounded-[6px] flex items-center justify-center gap-[6px] bg-surface border border-line text-[12px] font-[600] text-ink hover:border-inkSoft transition-colors focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ExternalLinkIcon size={13} />
            <span className="phone:hidden">
              {t('open_original', 'Open original')}
            </span>
          </a>
        </div>
      </ModalHeaderSlot>

      {/* The media fills the stage as an absolutely positioned box and
          letterboxes inside it with `object-contain`. It must not be sized with
          `max-h-full`: that percentage resolves against the stage's flex height,
          which is indefinite while the stage is being laid out, so the
          constraint drops and the media sizes the card instead — a 9:16 item
          then makes the card 1877px tall. Measured across five viewports. */}
      <div className="flex-1 relative flex items-center justify-center bg-panel rounded-[12px] overflow-hidden">
        {isVideo ? (
          /* No autoplay: opening a preview should not start audio, and
             stepping with the arrows would start it again on every video. It
             also stops the browser's own live-caption overlay engaging
             unprompted. The `#t=0.1` fragment VideoFrame appends is what gives
             a still frame instead of a black rectangle until play. */
          <VideoFrame
            key={media.id}
            url={url}
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
            alt={displayName}
            onLoad={(e) =>
              setLoaded({
                id: media.id,
                width: e.currentTarget.naturalWidth,
                height: e.currentTarget.naturalHeight,
              })
            }
          />
        )}

        {(items.length > 1 || hasMore) && (
          <>
            <button
              type="button"
              onClick={() => step('previous')}
              disabled={position === 0}
              aria-label={t('previous', 'Previous')}
              className={`${control} start-[16px]`}
            >
              <ChevronLeftIcon size={20} className="rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => step('next')}
              disabled={position === items.length - 1 && !hasMore}
              aria-label={t('next', 'Next')}
              className={`${control} end-[16px]`}
            >
              <ChevronRightIcon size={20} className="rtl:rotate-180" />
            </button>
          </>
        )}
      </div>

      {!!onDelete && (
        <div className="flex items-center justify-between gap-[12px] pt-[16px]">
          {/* As the file's month heading reads it. */}
          <div className="min-w-0 truncate text-[13px] text-muted">
            {!!media.createdAt && newDayjs(media.createdAt).format('MMMM YYYY')}
          </div>
          <button
            type="button"
            onClick={remove}
            className="cursor-pointer shrink-0 h-[34px] coarse:min-h-[44px] px-[12px] rounded-[8px] flex items-center gap-[8px] bg-surface border border-line text-[13px] font-[600] text-ink hover:border-inkSoft transition-colors focus-visible:ring-2 focus-visible:ring-brand"
          >
            <TrashIcon size={16} />
            {t('delete', 'Delete')}
          </button>
        </div>
      )}
    </>
  );
};

/**
 * The media library's viewer, over the list the Media page or the window shows:
 * it reads the same `useMediaLibrary(query)` key, so it shares the list's cache
 * and loaded pages and sees files load and leave. Its mount refetches nothing:
 * it opens over a list that has just loaded.
 */
export const LibraryPreview: FC<{
  query: MediaLibraryQuery;
  /** The file it opens on. */
  startId: string;
  /** Told the id of each file its Delete removed. */
  onDeleted: (id: string) => void;
}> = ({ query, startId, onDeleted }) => {
  const t = useT();
  const toaster = useToaster();
  const { files, hasMore, loadMore } = useMediaLibrary(query);
  const deleteMedia = useDeleteMedia();
  const refresh = useRefreshMediaLibrary(query);

  const onDelete = useCallback(
    async (file: PreviewItem) => {
      const notDeleted = await deleteMedia([file.id]);
      if (notDeleted) {
        toaster.show(
          t('media_not_deleted', '{{value}} file was not deleted', {
            count: notDeleted,
            value: notDeleted.toLocaleString('en-US'),
          }),
          'warning'
        );
      } else {
        toaster.show(
          t('media_deleted', 'File deleted', { count: 1, value: '1' }),
          'success'
        );
        onDeleted(file.id);
      }
      // the list and its month counts, either way
      await refresh();
      return !notDeleted;
    },
    [deleteMedia, toaster, t, onDeleted, refresh]
  );

  return (
    <MediaPreview
      items={files}
      index={Math.max(
        files.findIndex((file) => file.id === startId),
        0
      )}
      hasMore={hasMore}
      loadMore={loadMore}
      onDelete={onDelete}
    />
  );
};

/** The options both viewers open with, for `openModal`. */
const previewModal = (children: ReactElement) => ({
  // The header describes whichever item the preview is showing, which only the
  // preview knows, so it fills the title row from the body.
  title: <ModalHeaderSlotTarget />,
  // All three are load-bearing: `top` keeps the modal out of its centring
  // branch, whose pt/pb-[100px] costs a third of a 1366x768 viewport, and `size`
  // is what disables the card's min-w-[600px].
  top: 20,
  size: 'min(1120px, calc(100vw - 40px))',
  height: 'calc(100vh - 40px)',
  // On a phone the card's own 32px padding is 18% of its width.
  cardClassName: 'phone:!p-[16px]',
  children,
});

/** The plain viewer, as Samy's chat opens it: no Delete and no loading more. */
export const mediaPreviewModal = (items: PreviewItem[], index: number) =>
  previewModal(<MediaPreview items={items} index={index} />);

/** The media library's viewer, on `startId` in the list for `query`. */
export const libraryPreviewModal = (
  query: MediaLibraryQuery,
  startId: string,
  onDeleted: (id: string) => void
) =>
  previewModal(
    <LibraryPreview query={query} startId={startId} onDeleted={onDeleted} />
  );
