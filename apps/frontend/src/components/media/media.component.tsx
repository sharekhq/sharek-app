'use client';

import React, {
  ChangeEvent,
  ClipboardEvent,
  FC,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@gitroom/react/form/button';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { formatDuration } from '@gitroom/helpers/utils/format.duration';
import { Media } from '@prisma/client';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import EventEmitter from 'events';
import { useToaster } from '@gitroom/react/toaster/toaster';
import clsx from 'clsx';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { useUppyUploader } from '@gitroom/frontend/components/media/new.uploader';
import dynamic from 'next/dynamic';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import { DropFiles } from '@gitroom/frontend/components/layout/drop.files';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { ThirdPartyMedia } from '@gitroom/frontend/components/third-parties/third-party.media';
import { ReactSortable } from 'react-sortablejs';
import { MediaComponentInner } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { MediaPreview } from '@gitroom/frontend/components/media/media.preview';
import { AiVideo } from '@gitroom/frontend/components/launches/ai.video';
import type { MediaDestination } from '@gitroom/frontend/components/ui/media.destination';
import {
  ModalHeaderSlotTarget,
  useModals,
} from '@gitroom/frontend/components/layout/new-modal';
import { ThirdPartyMediaLibrary } from '@gitroom/frontend/components/third-parties/third-party.media-library';
import { Dashboard } from '@uppy/react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  DeleteCircleIcon,
  CloseCircleIcon,
  DragHandleIcon,
  MediaSettingsIcon,
  InsertMediaIcon,
  DesignMediaIcon,
  VerticalDividerIcon,
} from '@gitroom/frontend/components/ui/icons';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useDebounce } from 'use-debounce';
const Polonto = dynamic(
  () => import('@gitroom/frontend/components/launches/polonto')
);
const showModalEmitter = new EventEmitter();
const MediaEmptyIllustration = () => (
  <svg
    width="132"
    height="108"
    viewBox="0 0 132 108"
    fill="none"
    className="text-muted"
    role="presentation"
  >
    <rect
      x="34"
      y="22"
      width="74"
      height="56"
      rx="6"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.35"
    />
    <rect
      x="22"
      y="34"
      width="74"
      height="58"
      rx="6"
      fill="var(--surface)"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="41" cy="52" r="7" className="text-brand" fill="currentColor" />
    <path
      d="M26 86 L46 63 L60 76 L74 58 L92 86"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.55"
    />
  </svg>
);
export const Pagination: FC<{
  current: number;
  totalPages: number;
  setPage: (num: number) => void;
}> = (props) => {
  const t = useT();

  const { current, totalPages, setPage } = props;

  const paginationItems = useMemo(() => {
    // Convert to 1-based for algorithm (current is 0-based)
    const c = current + 1;
    const m = totalPages;

    // If total pages <= 10, show all pages
    if (m <= 10) {
      return Array.from({ length: m }, (_, i) => i + 1);
    }

    const delta = 3;
    const left = c - delta;
    const right = c + delta + 1;
    const range: number[] = [];
    const rangeWithDots: (number | '...')[] = [];
    let l: number | undefined;

    // Build the range of pages to show
    for (let i = 1; i <= m; i++) {
      if (i === 1 || i === m || (i >= left && i < right)) {
        range.push(i);
      }
    }

    // Add dots where there are gaps
    for (const i of range) {
      if (l !== undefined) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    // Limit to maximum 10 items by trimming pages near edges if needed
    while (rangeWithDots.length > 10) {
      const currentIndex = rangeWithDots.findIndex((item) => item === c);
      if (currentIndex !== -1 && currentIndex > rangeWithDots.length / 2) {
        // Current is in second half, remove one item from start side
        rangeWithDots.splice(2, 1);
      } else {
        // Current is in first half, remove one item from end side
        rangeWithDots.splice(-3, 1);
      }
    }

    return rangeWithDots;
  }, [current, totalPages]);

  return (
    <ul className="flex flex-row items-center gap-1 justify-center mt-[15px]">
      <li className={clsx(current === 0 && 'opacity-20 pointer-events-none')}>
        <div
          className="cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 gap-1 ps-2.5 text-muted hover:text-newTextColor hover:bg-boxHover"
          aria-label="Go to previous page"
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeftIcon className="lucide lucide-chevron-left h-4 w-4" />
          <span>{t('previous', 'Previous')}</span>
        </div>
      </li>
      {paginationItems.map((item, index) => (
        <li key={index}>
          {item === '...' ? (
            <span className="inline-flex items-center justify-center h-10 w-10 text-textColor select-none">
              ...
            </span>
          ) : (
            <div
              aria-current="page"
              onClick={() => setPage(item - 1)}
              className={clsx(
                'cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border h-10 w-10 border-newBorder',
                current === item - 1
                  ? 'bg-brand !text-white'
                  : 'text-textColor hover:bg-boxHover'
              )}
            >
              {item}
            </div>
          )}
        </li>
      ))}
      <li
        className={clsx(
          current + 1 === totalPages && 'opacity-20 pointer-events-none'
        )}
      >
        <a
          className="group cursor-pointer inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 gap-1 pe-2.5 text-muted hover:text-newTextColor hover:bg-boxHover"
          aria-label="Go to next page"
          onClick={() => setPage(current + 1)}
        >
          <span>{t('next', 'Next')}</span>
          <ChevronRightIcon className="lucide lucide-chevron-right h-4 w-4" />
        </a>
      </li>
    </ul>
  );
};
export const ShowMediaBoxModal: FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [callBack, setCallBack] =
    useState<(params: { id: string; path: string }[]) => void | undefined>();
  const closeModal = useCallback(() => {
    setShowModal(false);
    setCallBack(undefined);
  }, []);
  useEffect(() => {
    showModalEmitter.on('show-modal', (cCallback) => {
      setShowModal(true);
      setCallBack(() => cCallback);
    });
    return () => {
      showModalEmitter.removeAllListeners('show-modal');
    };
  }, []);
  if (!showModal) return null;
  return (
    <div className="text-textColor">
      <MediaBox setMedia={callBack!} closeModal={closeModal} />
    </div>
  );
};
export const showMediaBox = (
  callback: (params: { id: string; path: string }) => void
) => {
  showModalEmitter.emit('show-modal', callback);
};
const CHUNK_SIZE = 1024 * 1024;
const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

/**
 * A video tile: the frame, plus the badge that marks it as video and carries
 * its length. The duration comes from the metadata the tile already preloads,
 * so the badge costs no extra request — and a stream, which reports a
 * non-finite duration, shows the glyph alone rather than a confident 0:00.
 *
 * The badge is `aria-hidden`: it repeats visually what the `<video>` element
 * already tells assistive technology.
 */
const VideoTile: FC<{ url: string }> = ({ url }) => {
  const [duration, setDuration] = useState(NaN);
  const length = formatDuration(duration);
  return (
    <>
      <VideoFrame
        url={url}
        onLoadedMetadata={(video) => setDuration(video.duration)}
      />
      <div
        aria-hidden="true"
        dir="ltr"
        className="absolute z-[30] top-[6px] start-[6px] pointer-events-none flex items-center gap-[4px] h-[20px] px-[6px] rounded-[4px] bg-black/60 text-white text-[11px] font-[500]"
      >
        <svg width="7" height="8" viewBox="0 0 7 8" fill="none">
          <path
            d="M6.5 3.567a.5.5 0 0 1 0 .866L.75 7.763A.5.5 0 0 1 0 7.33V.67A.5.5 0 0 1 .75.237L6.5 3.567Z"
            fill="currentColor"
          />
        </svg>
        {!!length && <span>{length}</span>}
      </div>
    </>
  );
};
export const MediaBox: FC<{
  setMedia: (params: { id: string; path: string }[]) => void;
  standalone?: boolean;
  type?: 'image' | 'video';
  closeModal: () => void;
}> = ({ type, standalone, setMedia }) => {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const fetch = useFetch();
  const modals = useModals();
  const toaster = useToaster();
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);
  const loadMedia = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page + 1) });
    if (debouncedSearch.trim()) {
      params.set('search', debouncedSearch.trim());
    }
    return (await fetch(`/media?${params.toString()}`)).json();
  }, [page, debouncedSearch]);
  const { data, mutate, isLoading } = useSWR(
    `get-media-${page}-${debouncedSearch}`,
    loadMedia
  );
  // The tiles and the preview read the same array, so they can never disagree
  // about a position or a count.
  const visibleMedia = useMemo(
    () =>
      ((data?.results || []) as Media[]).filter((f) => {
        if (type === 'video') {
          return hasExtension(f.path, 'mp4');
        } else if (type === 'image') {
          return !hasExtension(f.path, 'mp4');
        }
        return true;
      }),
    [data?.results, type]
  );
  const [selected, setSelected] = useState([]);
  const t = useT();
  const uploaderRef = useRef<any>(null);
  const mediaDirectory = useMediaDirectory();
  const [loading, setLoading] = useState(false);

  const uppy = useUppyUploader({
    allowedFileTypes:
      type == 'image'
        ? 'image/*'
        : type == 'video'
        ? 'video/mp4'
        : 'image/*,video/mp4',
    onUploadSuccess: async (arr) => {
      await mutate();
      if (standalone) {
        return;
      }
      setSelected((prevSelected) => {
        return [...prevSelected, ...arr];
      });
    },
    onStart: () => setLoading(true),
    onEnd: () => setLoading(false),
  });

  const addRemoveSelected = useCallback(
    (media: any) => () => {
      if (standalone) {
        return;
      }
      const exists = selected.find((p: any) => p.id === media.id);
      if (exists) {
        setSelected(selected.filter((f: any) => f.id !== media.id));
        return;
      }
      setSelected([...selected, media]);
    },
    [selected]
  );

  const addMedia = useCallback(async () => {
    if (standalone) {
      return;
    }
    // @ts-ignore
    setMedia(selected);
    modals.closeCurrent();
  }, [selected]);

  const addToUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setLoading(true);

      // @ts-ignore
      uppy.addFiles(files);
    },
    [toaster, t]
  );

  const dragAndDrop = useCallback(
    async (event: ClipboardEvent<HTMLDivElement> | File[]) => {
      // @ts-ignore
      const clipboardItems = event.map((p) => ({
        kind: 'file',
        getAsFile: () => p,
      }));
      if (!clipboardItems) {
        return;
      }

      const files: File[] = [];
      // @ts-ignore
      for (const item of clipboardItems) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      const totalSize = files.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setLoading(true);

      for (const file of files) {
        uppy.addFile(file);
      }
    },
    [toaster, t]
  );

  const maximize = useCallback(
    (media: Media, index: number) => (e: any) => {
      e.stopPropagation();
      // All three options are load-bearing: `top` keeps the modal out of its
      // centring branch, whose pt/pb-[100px] costs a third of a 1366x768
      // viewport, and `size` is what disables the card's min-w-[600px].
      modals.openModal({
        // The header describes whichever item the preview is showing, which
        // only the preview knows, so it fills the title row from the body.
        title: <ModalHeaderSlotTarget />,
        top: 20,
        size: 'min(1120px, calc(100vw - 40px))',
        height: 'calc(100vh - 40px)',
        // On a phone the card's own 32px padding is 18% of its width.
        cardClassName: 'phone:!p-[16px]',
        children: <MediaPreview items={visibleMedia} index={index} />,
      });
    },
    [visibleMedia]
  );

  const deleteImage = useCallback(
    (media: Media) => async (e: any) => {
      e.stopPropagation();
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete_this_file',
            'Are you sure you want to delete this file?'
          )
        ))
      ) {
        return;
      }
      await fetch(`/media/${media.id}`, {
        method: 'DELETE',
      });
      mutate();
    },
    [mutate]
  );

  const btn = useMemo(() => {
    return (
      <button
        disabled={loading}
        onClick={() => uploaderRef?.current?.click()}
        className="relative cursor-pointer bg-btnPrimary text-white changeColor flex gap-[8px] h-[44px] px-[18px] justify-center items-center rounded-[8px]"
      >
        {loading ? (
          <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
            <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
          </div>
        ) : (
          <PlusIcon size={14} />
        )}
        <div className={loading ? 'invisible' : undefined}>{t('upload', 'Upload')}</div>
      </button>
    );
  }, [t, loading]);

  return (
    <DropFiles disabled={loading} className="flex flex-col flex-1" onDrop={dragAndDrop}>
      <div className="flex flex-col flex-1">
        <div
          className={clsx(
            'flex flex-wrap items-center gap-[12px]',
            !isLoading &&
              !data?.results?.length &&
              !debouncedSearch &&
              'hidden'
          )}
        >
          {/* The search takes its own line on a phone, so Upload and Import
              wrap below it instead of off the edge. */}
          <div className="flex-1 phone:basis-full">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search_media_by_name', 'Search by file name')}
              className="w-full h-[44px] px-[14px] rounded-[8px] bg-newBgColorInner border border-newColColor text-[14px] outline-none focus:border-brand"
            />
          </div>
          <input
            type="file"
            ref={uploaderRef}
            onChange={addToUpload}
            className="hidden"
            multiple={true}
          />
          <div className="flex flex-wrap gap-[8px]">
            {btn}
            <ThirdPartyMediaLibrary onImported={() => mutate()} />
          </div>
        </div>
        <div className="w-full pointer-events-none relative mt-[5px] mb-[5px]">
          <div className="w-full h-[46px] overflow-hidden absolute left-0 bg-newBgColorInner uppyChange">
            <Dashboard
              height={46}
              uppy={uppy}
              id={`uploader`}
              showProgressDetails={true}
              hideUploadButton={true}
              hideRetryButton={true}
              hidePauseResumeButton={true}
              hideCancelButton={true}
              hideProgressAfterFinish={true}
            />
          </div>
          <div className="w-full h-[46px] uppyChange" />
        </div>
        <div className="flex-1 relative">
          <div
            className={clsx(
              'absolute inset-0 overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner',
              !isLoading && !data?.results?.length
                ? 'w-full flex justify-center items-center flex-col'
                : // Capped at eight columns past the target width: auto-fill
                  // would otherwise keep adding 150px columns, so a wide screen
                  // gets denser rather than bigger and 32 items stop filling
                  // whole rows. Below 2xl this changes nothing.
                  'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] 2xl:grid-cols-8 phone:grid-cols-2 gap-[6px] content-start'
            )}
          >
            {!isLoading && !data?.results?.length && (
              <EmptyState
                illustration={<MediaEmptyIllustration />}
                title={
                  debouncedSearch
                    ? t('no_media_match_search', 'No media matches your search')
                    : t(
                        'you_dont_have_any_media_yet',
                        "You don't have any media yet"
                      )
                }
                description={`${t(
                  'select_or_upload_pictures_max_1gb',
                  'Select or upload pictures (maximum 1 GB per upload).'
                )} ${t(
                  'you_can_drag_drop_pictures',
                  'You can also drag & drop pictures.'
                )}`}
                actions={
                  <>
                    <Button
                      onClick={() => uploaderRef?.current?.click()}
                      innerClassName="gap-[8px]"
                    >
                      <PlusIcon size={14} />
                      {t('upload', 'Upload')}
                    </Button>
                    <ThirdPartyMediaLibrary onImported={() => mutate()} />
                  </>
                }
              />
            )}
            {isLoading && (
              <>
                {/* One skeleton per item the page will hold — MEDIA_PAGE_SIZE
                    in media.repository.ts. */}
                {[...new Array(32)].map((_, i) => (
                  <div
                    className="rounded-[6px] cursor-pointer aspect-square"
                    key={i}
                  >
                    <div className="w-full h-full bg-newSep rounded-[6px] animate-pulse" />
                  </div>
                ))}
              </>
            )}
            {visibleMedia.map((media: any, index: number) => {
              // `originalName` is nullable; `name` never is. Without this the
              // caption, the tooltip, the alt text and the delete button's
              // label are all empty for older uploads.
              const displayName = media.originalName || media.name;
              return (
                <div
                  className={clsx(
                    'group rounded-[6px] aspect-square',
                    !standalone && 'cursor-pointer'
                  )}
                  key={media.id}
                >
                  <div
                    className={clsx(
                      'w-full h-full rounded-[6px] border-[4px] relative',
                      !!selected.find((p) => p.id === media.id)
                        ? 'border-brand'
                        : 'border-transparent'
                    )}
                    onClick={addRemoveSelected(media)}
                  >
                    {!!selected.find((p: any) => p.id === media.id) ? (
                      <div className="text-white flex z-[101] justify-center items-center text-[14px] font-[500] w-[24px] h-[24px] rounded-full bg-brand absolute -bottom-[10px] -end-[10px]">
                        {selected.findIndex((z: any) => z.id === media.id) + 1}
                      </div>
                    ) : (
                      /* Inside the tile and revealed by opacity rather than
                         `display`, so the button can take focus at all — a
                         `hidden` control is out of the tab order, which would
                         leave its focus ring unreachable, and a 36px target
                         hanging over the tile edge would swallow clicks meant
                         for the neighbouring cell.
                         An `opacity: 0` element is still hit-tested and there is
                         no hover on touch, so it stays `pointer-events-none`
                         until it is actually revealed — otherwise a tap on this
                         corner would open the delete prompt instead of selecting
                         the item. Under a coarse pointer that reasoning holds in
                         the picker and inverts in the library: there the tile
                         selects nothing, and hover-only would mean media can
                         never be deleted on touch at all. */
                      <button
                        type="button"
                        onClick={deleteImage(media)}
                        aria-label={t('delete_media_named', 'Delete {{name}}', {
                          name: displayName,
                        })}
                        className={clsx(
                          'cursor-pointer z-[100] flex items-center justify-center absolute top-[4px] end-[4px] w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-full opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity focus-visible:ring-2 focus-visible:ring-brand',
                          standalone &&
                            'coarse:opacity-100 coarse:pointer-events-auto'
                        )}
                      >
                        <DeleteCircleIcon size={28} />
                      </button>
                    )}
                    {/* The tile carries the tooltip, not the caption strip: the
                        strip is pointer-events-none, so a `title` on it would
                        never be reachable. */}
                    <div
                      title={displayName}
                      className="w-full h-full rounded-[6px] overflow-hidden relative"
                    >
                      {/* A 36px circle matching the lightbox's own prev/next
                          controls, revealed by colour rather than by growing
                          50% under the cursor. A button rather than a div
                          because this is the only way into the preview, and a
                          div cannot be reached from the keyboard. */}
                      <button
                        type="button"
                        onClick={maximize(media, index)}
                        aria-label={t('open_preview', 'Open preview')}
                        className={clsx(
                          'cursor-pointer absolute z-[20] left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-full flex items-center justify-center text-white bg-black/45 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:bg-black/[0.68] transition-all focus-visible:ring-2 focus-visible:ring-brand',
                          // Only in the library, where the tile itself does
                          // nothing on tap. In the picker the tile selects, and
                          // a live 36px control in its centre would swallow the
                          // tap that selects the item — the primary action here.
                          standalone &&
                            'coarse:opacity-100 coarse:pointer-events-auto'
                        )}
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
                      {hasExtension(media.path, 'mp4') ? (
                        <VideoTile url={mediaDirectory.set(media.path)} />
                      ) : (
                        <img
                          width="100%"
                          height="100%"
                          className="w-full h-full object-cover"
                          src={mediaDirectory.set(media.path)}
                          alt={displayName}
                        />
                      )}
                      {/* Inside the clip wrapper, which is what makes an overlap
                          with a neighbouring tile structurally impossible. */}
                      <div
                        dir="ltr"
                        className="absolute z-[30] inset-x-0 bottom-0 px-[8px] py-[6px] truncate text-[12px] text-white bg-gradient-to-t from-black/75 to-transparent opacity-0 group-hover:opacity-100 coarse:opacity-100 transition-opacity pointer-events-none"
                      >
                        {displayName}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(data?.pages || 0) > 1 && (
          <Pagination
            current={page}
            totalPages={data?.pages}
            setPage={setPage}
          />
        )}
        {!standalone && (
          <div className="flex justify-end mt-[32px] gap-[8px]">
            <button
              onClick={() => modals.closeCurrent()}
              className="cursor-pointer h-[52px] px-[20px] items-center justify-center border border-newTextColor/10 flex rounded-[10px]"
            >
              {t('cancel', 'Cancel')}
            </button>
            {!isLoading && !!data?.results?.length && (
              <button
                onClick={standalone ? () => {} : addMedia}
                disabled={selected.length === 0}
                className="cursor-pointer text-white disabled:opacity-80 disabled:cursor-not-allowed h-[52px] px-[20px] items-center justify-center bg-brand flex rounded-[10px]"
              >
                {t('add_selected_media', 'Add selected media')}
              </button>
            )}
          </div>
        )}
      </div>
    </DropFiles>
  );
};
export const MultiMediaComponent: FC<{
  label: string;
  description: string;
  mediaNotAvailable?: boolean;
  designNotAvailable?: boolean;
  aiVideoNotAvailable?: boolean;
  /**
   * Where this row's media ends up, for the generators that open from it to
   * promise. The composer's post by default; a row that collects something
   * else — a provider's reference images — says so.
   */
  destination?: MediaDestination;
  /**
   * Drops the chrome this component wears inside the composer — the divider
   * above it and the 12px inset that lines its row up with the editor's own
   * padding. Set it when the component sits directly in a modal, where both
   * read as a stray border and a stray indent.
   */
  flush?: boolean;
  dummy: boolean;
  allData: {
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
  }[];
  value?: Array<{
    path: string;
    id: string;
  }>;
  text: string;
  name: string;
  error?: any;
  onOpen?: () => void;
  onClose?: () => void;
  toolBar?: React.ReactNode;
  information?: React.ReactNode;
  onChange: (event: {
    target: {
      name: string;
      value?: Array<{
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
        thumbnailTimestamp?: number;
      }>;
    };
  }) => void;
}> = (props) => {
  const {
    name,
    error,
    text,
    onChange,
    value,
    allData,
    dummy,
    toolBar,
    information,
    mediaNotAvailable,
    designNotAvailable,
    aiVideoNotAvailable,
    destination,
    flush,
  } = props;
  const user = useUser();
  const modals = useModals();
  const t = useT();
  useEffect(() => {
    if (value) {
      setCurrentMedia(value);
    }
  }, [value]);

  const [currentMedia, setCurrentMedia] = useState(value);
  const mediaDirectory = useMediaDirectory();
  const changeMedia = useCallback(
    (
      m:
        | {
            path: string;
            id: string;
          }
        | {
            path: string;
            id: string;
          }[]
    ) => {
      const mediaArray = Array.isArray(m) ? m : [m];
      const newMedia = [...(currentMedia || []), ...mediaArray];
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [currentMedia]
  );
  const showModal = useCallback(() => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'calc(100% - 80px)',
      height: 'calc(100% - 80px)',
      children: (close) => (
        <MediaBox setMedia={changeMedia} closeModal={close} />
      ),
    });
  }, [changeMedia, t]);

  const clearMedia = useCallback(
    (topIndex: number) => () => {
      const newMedia = currentMedia?.filter((f, index) => index !== topIndex);
      setCurrentMedia(newMedia);
      onChange({
        target: {
          name,
          value: newMedia,
        },
      });
    },
    [currentMedia]
  );

  const designMedia = useCallback(() => {
    if (!!user?.tier?.ai && !dummy) {
      modals.openModal({
        askClose: false,
        title: t('design_media', 'Design Media'),
        size: '80%',
        children: (close) => (
          <Polonto setMedia={changeMedia} closeModal={close} />
        ),
      });
    }
  }, [changeMedia, t]);

  return (
    <>
      <div className="b1 flex flex-col gap-[8px] rounded-bl-[8px] select-none w-full">
        {!!currentMedia?.length && (
        <div className={clsx('flex gap-[10px]', !flush && 'px-[12px]')}>
            <ReactSortable
              list={currentMedia}
              setList={(value) =>
                onChange({ target: { name: 'upload', value } })
              }
              className="flex gap-[10px] sortable-container"
              animation={200}
              swap={true}
              handle=".dragging"
            >
              {currentMedia.map((media, index) => (
                  // Grown rather than de-classed: this thumbnail carries no
                  // handler of its own, but it is the interactive unit holding
                  // three that do, and its cursor-pointer is what gives the
                  // drag, settings and close controls inside it their cursor.
                  // Dropping it would take the pointer off the close badge.
                  <div key={media.id} className="cursor-pointer rounded-[5px] w-[40px] h-[40px] coarse:w-[44px] coarse:h-[44px] border-2 border-tableBorder relative flex transition-all">
                    <DragHandleIcon className="z-[20] dragging absolute pe-[1px] pb-[3px] -start-[4px] -top-[4px] cursor-move" />

                    <div className="w-full h-full relative group">
                      <div
                        onClick={async () => {
                          modals.openModal({
                            title: t('media_settings', 'Media Settings'),
                            children: (close) => (
                              <MediaComponentInner
                                media={media as any}
                                onClose={close}
                                onSelect={(value: any) => {
                                  onChange({
                                    target: {
                                      name: 'upload',
                                      value: currentMedia.map((p) => {
                                        if (p.id === media.id) {
                                          return {
                                            ...p,
                                            ...value,
                                          };
                                        }
                                        return p;
                                      }),
                                    },
                                  });
                                }}
                              />
                            ),
                          });
                        }}
                        // cursor-pointer moves up from the icon to here, where
                        // the handler is, so the measured box and the tap
                        // target are the same element. Absolutely positioned,
                        // so reaching the floor under coarse costs no layout
                        // width — it grows over the thumbnail, not beside it.
                        className="absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] bg-black/80 rounded-[10px] opacity-0 group-hover:opacity-100 coarse:opacity-100 transition-opacity z-[9] cursor-pointer coarse:w-[44px] coarse:h-[44px] coarse:flex coarse:items-center coarse:justify-center"
                      >
                        <MediaSettingsIcon className="relative z-[200]" />
                      </div>
                      {hasExtension(media?.path, 'mp4') ? (
                        <VideoFrame url={mediaDirectory.set(media?.path)} />
                      ) : (
                        <img
                          className="w-full h-full object-cover rounded-[4px]"
                          src={mediaDirectory.set(media?.path)}
                        />
                      )}
                    </div>

                    <CloseCircleIcon
                      onClick={clearMedia(index)}
                      className="absolute -end-[4px] -top-[4px] z-[20] rounded-full bg-white"
                    />
                  </div>
              ))}
            </ReactSortable>
        </div>
        )}
        <div
          className={clsx(
            'flex gap-[8px] w-full b1 text-textColor',
            // Below `mobile` this row's controls are wider than the pane that
            // holds them — measured at 390 inside compose, where the editor's
            // own scroll container is overflow-x: hidden, so they were cut off
            // rather than reachable (specs/017-compose-viewport R11).
            //
            // A scroller, not a wrap: this row is a compressed flex item —
            // 105px of box holding 159px of content — so a second line does not
            // make it taller, it spills through overflow: visible onto the
            // control below. Scrolling keeps the height exactly as it is, and
            // it is what the sizing contract asks for anyway: content that
            // cannot reflow is owned by a scroll container rather than clipped.
            'mobile:overflow-x-auto mobile:flex-nowrap mobile:[&>*]:flex-none',
            'mobile:[scrollbar-width:none] mobile:[&::-webkit-scrollbar]:hidden',
            !flush && 'px-[12px] border-t border-newColColor'
          )}
        >
          {!mediaNotAvailable && (
            <div className="flex flex-wrap py-[10px] b2 items-center gap-[4px]">
              <div
                onClick={showModal}
                className="cursor-pointer h-[30px] coarse:h-[44px] coarse:min-w-[44px] rounded-[6px] justify-center items-center flex bg-surface border border-line px-[8px]"
              >
                <div className="flex gap-[8px] items-center">
                  <div>
                    <InsertMediaIcon />
                  </div>
                  <div className="text-[12px] font-[600] mobile:hidden block">
                    {t('insert_media', 'Insert Media')}
                  </div>
                </div>
              </div>
              {!designNotAvailable && (
                <div
                  onClick={designMedia}
                  className="cursor-pointer h-[30px] coarse:h-[44px] coarse:min-w-[44px] rounded-[6px] justify-center items-center flex bg-surface border border-line px-[8px]"
                >
                  <div className="flex gap-[5px] items-center">
                    <div>
                      <DesignMediaIcon />
                    </div>
                    <div className="text-[12px] font-[600] mobile:hidden block">
                      {t('design_media', 'Design Media')}
                    </div>
                  </div>
                </div>
              )}

              <ThirdPartyMedia allData={allData} onChange={changeMedia} />

              {!!user?.tier?.ai && (
                <>
                  <AiImage
                    value={text}
                    onChange={changeMedia}
                    destination={destination}
                  />
                  {!aiVideoNotAvailable && (
                    <AiVideo
                      value={text}
                      onChange={changeMedia}
                      destination={destination}
                    />
                  )}
                </>
              )}
            </div>
          )}
          {!mediaNotAvailable && !!toolBar && (
            <div className="text-newColColor h-full flex items-center">
              <VerticalDividerIcon />
            </div>
          )}
          {!!toolBar && (
            <div className="flex flex-wrap py-[10px] b2 items-center gap-[4px]">
              {toolBar}
            </div>
          )}
          {information && (
            <div className="flex-1 justify-end flex py-[10px] b2 items-center gap-[4px]">
              {information}
            </div>
          )}
        </div>
      </div>
      <div className="text-[12px] text-error">{error}</div>
    </>
  );
};
export const MediaComponent: FC<{
  label: string;
  description: string;
  value?: {
    path: string;
    id: string;
  };
  name: string;
  onChange: (event: {
    target: {
      name: string;
      value?: {
        id: string;
        path: string;
      };
    };
  }) => void;
  type?: 'image' | 'video';
  width?: number;
  height?: number;
}> = (props) => {
  const t = useT();

  const { name, type, label, description, onChange, value, width, height } =
    props;
  const { getValues } = useSettings();
  const user = useUser();
  useEffect(() => {
    const settings = getValues()[props.name];
    if (settings) {
      setCurrentMedia(settings);
    }
  }, []);
  const [currentMedia, setCurrentMedia] = useState(value);
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();

  const showDesignModal = useCallback(() => {
    modals.openModal({
      title: t('media_editor', 'Media Editor'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'calc(100% - 80px)',
      height: 'calc(100% - 80px)',
      children: (close) => (
        <Polonto
          width={width}
          height={height}
          setMedia={changeMedia}
          closeModal={close}
        />
      ),
    });
  }, [t]);
  const changeMedia = useCallback((m: { path: string; id: string }[]) => {
    setCurrentMedia(m[0]);
    onChange({
      target: {
        name,
        value: m[0],
      },
    });
  }, []);
  const showModal = useCallback(() => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: 'calc(100% - 80px)',
      height: 'calc(100% - 80px)',
      children: (close) => (
        <MediaBox setMedia={changeMedia} closeModal={close} type={type} />
      ),
    });
  }, [t]);
  const clearMedia = useCallback(() => {
    setCurrentMedia(undefined);
    onChange({
      target: {
        name,
        value: undefined,
      },
    });
  }, [value]);
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="text-[14px]">{label}</div>
      <div className="text-[12px]">{description}</div>
      {!!currentMedia && (
        <div className="my-[20px] cursor-pointer w-[200px] h-[200px] border-2 border-tableBorder">
          <img
            className="w-full h-full object-cover"
            src={currentMedia.path}
            onClick={() => window.open(mediaDirectory.set(currentMedia.path))}
          />
        </div>
      )}
      <div className="flex gap-[5px]">
        <Button onClick={showModal}>{t('select', 'Select')}</Button>
        <Button onClick={showDesignModal} className="!bg-brand">
          {t('editor', 'Editor')}
        </Button>
        <Button secondary={true} onClick={clearMedia}>
          {t('clear', 'Clear')}
        </Button>
      </div>
    </div>
  );
};
