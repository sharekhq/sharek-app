'use client';

import React, {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { followChatBottom } from '@gitroom/frontend/components/agents/agent.created.media';
import { AiImage } from '@gitroom/frontend/components/launches/ai.image';
import Loading from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import {
  MAX_UPLOAD_SIZE,
  MediaBox,
  mediaLibrarySize,
} from '@gitroom/frontend/components/media/media.component';
import { useUppyUploader } from '@gitroom/frontend/components/media/new.uploader';
import {
  AiImageIcon,
  InsertMediaIcon,
} from '@gitroom/frontend/components/ui/icons';

export type Attachment = { id: string; path: string };

/**
 * One item in the box. A Media row from the start, if it came from the library
 * or AI Image, or a file showing its object URL until its upload ends. The
 * fingerprint stays, because a file dropped again makes a new row, so its id
 * can't say it's the same file.
 */
type Tile = {
  key: string;
  media?: Attachment;
  file?: File;
  preview?: string;
  fingerprint?: string;
};

const AttachmentsContext = createContext<{
  tiles: Tile[];
  attached: Attachment[];
  uploading: boolean;
  addFiles: (files: File[]) => void;
  addMedia: (media: Attachment | Attachment[]) => void;
  remove: (key: string) => void;
  clear: () => void;
}>({
  tiles: [],
  attached: [],
  uploading: false,
  addFiles: () => {},
  addMedia: () => {},
  remove: () => {},
  clear: () => {},
});

export const useAttachments = () => useContext(AttachmentsContext);

/**
 * What's attached to the message being written. It sits above the chat, because
 * the drop zone wraps the whole chat column and the box sits inside it.
 *
 * Files go to Uppy one at a time. The hook's preprocessor rejects a whole batch
 * when one file is refused, and its `error` handler then cancels the good ones,
 * so a batch couldn't say "these attached, that one was refused". It also means
 * a result belongs to the file in flight, since results don't name their file.
 */
export const AttachmentsProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const t = useT();
  const toaster = useToaster();
  const [tiles, setTiles] = useState<Tile[]>([]);
  // The hook keeps the first render's callbacks, and Uppy's events decide what
  // happens next, so all of this reads the list here rather than from a render.
  const latest = useRef<Tile[]>([]);
  // The tile Uppy holds. It may have been removed since, and the next file still
  // waits for Uppy's report, or that report would be read as the next file's.
  const inFlight = useRef<string | null>(null);
  const started = useRef(false);

  const write = (next: Tile[]) => {
    latest.current = next;
    setTiles(next);
  };

  const refuseSize = () =>
    toaster.show(
      t(
        'upload_size_limit_exceeded',
        'Upload size limit exceeded. Maximum 1 GB per upload session.'
      ),
      'warning'
    );

  const uppy = useUppyUploader({
    allowedFileTypes: 'image/*,video/mp4',
    onStart: () => {
      started.current = true;
    },
    // `complete` calls this before onUploadSuccess on every path, so it ends nothing.
    onEnd: () => {},
    // Empty after a failed upload, and the hook has said so.
    onUploadSuccess: (saved: Attachment[]) => signals.current.finish(saved[0]),
  });

  const startNext = () => {
    const next = latest.current.find((tile) => !tile.media);
    if (inFlight.current || !next) {
      return;
    }

    inFlight.current = next.key;
    try {
      uppy.addFile(next.file);
    } catch {
      // Uppy throws on its own limit, and this box mounts no Uppy UI to show why.
      refuseSize();
      finish();
    }
  };

  // Ends the tile in flight, attached if a row came back. Uppy reports one ending
  // per upload, and a report with nothing in flight changes nothing.
  const finish = (saved?: Attachment) => {
    const key = inFlight.current;
    inFlight.current = null;
    started.current = false;

    const tile = latest.current.find((item) => item.key === key);
    if (tile) {
      URL.revokeObjectURL(tile.preview);
      const isNew =
        !!saved && !latest.current.some((item) => item.media?.id === saved.id);
      write(
        isNew
          ? latest.current.map((item) =>
              item === tile
                ? {
                    key,
                    fingerprint: tile.fingerprint,
                    media: { id: saved.id, path: saved.path },
                  }
                : item
            )
          : latest.current.filter((item) => item !== tile)
      );
    }
    startNext();
  };

  const onError = () => {
    // One file failing leaves its batch running, and `complete` reports it.
    if (Object.keys(uppy.getState().currentUploads).length) {
      return;
    }
    // Before the upload started, this is a refused file and the hook has said
    // why. After it, no `complete` follows, so nothing else will.
    if (started.current) {
      toaster.show(
        t(
          'some_files_failed_to_upload',
          'Some files failed to upload, please try again'
        ),
        'warning'
      );
    }
    finish();
  };

  // The uploader is created once, so it reads the latest of these from here.
  const signals = useRef({ finish, onError });
  useEffect(() => {
    signals.current = { finish, onError };
  });

  useEffect(() => {
    const listener = () => signals.current.onError();

    uppy.on('error', listener);
    return () => {
      uppy.off('error', listener);
      // Each chat makes its own, and it holds listeners on the window until told.
      uppy.destroy();
    };
  }, [uppy]);

  useEffect(() => {
    return () => {
      latest.current.forEach(
        (tile) => tile.preview && URL.revokeObjectURL(tile.preview)
      );
      latest.current = [];
    };
  }, []);

  const addFiles = (files: File[]) => {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_UPLOAD_SIZE) {
      refuseSize();
      return;
    }

    const next = [...latest.current];
    for (const file of files) {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (!next.some((tile) => tile.fingerprint === fingerprint)) {
        next.push({
          key: makeId(10),
          file,
          fingerprint,
          preview: URL.createObjectURL(file),
        });
      }
    }
    write(next);
    startNext();
  };

  const addMedia = (media: Attachment | Attachment[]) => {
    const next = [...latest.current];
    for (const { id, path } of Array.isArray(media) ? media : [media]) {
      if (!next.some((tile) => tile.media?.id === id)) {
        next.push({ key: makeId(10), media: { id, path } });
      }
    }
    write(next);
  };

  // Only off the message: a finished upload stays in the Media library. One still
  // running stops, so the files behind it don't wait for it. Uppy then reports an
  // empty ending, which is what starts the next file.
  const remove = (key: string) => {
    const tile = latest.current.find((item) => item.key === key);
    if (tile?.preview) {
      URL.revokeObjectURL(tile.preview);
    }
    write(latest.current.filter((item) => item.key !== key));
    if (key === inFlight.current) {
      uppy.cancelAll();
    }
  };

  return (
    <AttachmentsContext.Provider
      value={{
        tiles,
        attached: tiles.flatMap((tile) => (tile.media ? [tile.media] : [])),
        uploading: tiles.some((tile) => !tile.media),
        addFiles,
        addMedia,
        remove,
        clear: () => write([]),
      }}
    >
      {children}
    </AttachmentsContext.Provider>
  );
};

/** Marks a picture as a video. Whatever it marks carries the name. */
export const PlayBadge: FC = () => (
  <span
    aria-hidden="true"
    className="absolute inset-0 m-auto w-[32px] h-[32px] rounded-full bg-black/[0.62] text-white flex items-center justify-center pointer-events-none"
  >
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 3.2v9.6c0 .6.65 1 1.17.68l7.6-4.8a.8.8 0 0 0 0-1.36l-7.6-4.8A.8.8 0 0 0 5 3.2z" />
    </svg>
  </span>
);

const AttachmentTile: FC<{ tile: Tile; position: number }> = ({
  tile,
  position,
}) => {
  const t = useT();
  const mediaDirectory = useMediaDirectory();
  const { remove } = useAttachments();

  const uploading = !tile.media;
  const isVideo = uploading
    ? tile.file.type.startsWith('video/')
    : hasExtension(tile.media.path, 'mp4');
  const url = uploading ? tile.preview : mediaDirectory.set(tile.media.path);
  const picture = clsx(
    'block w-full h-full object-cover rounded-[12px] border border-line',
    uploading && 'opacity-[0.45]'
  );

  return (
    // The picture carries the rounding, not an overflow here: a remove target
    // grown to 44px reaches 5px past the tile's top and end.
    <div className="relative flex-none w-[96px] h-[96px] phone:w-[76px] phone:h-[76px] rounded-[12px] bg-surface2">
      {isVideo ? (
        <div
          role="img"
          aria-label={t('samy_attached_video', 'Attached video {{n}}', {
            n: position,
          })}
          className="w-full h-full"
        >
          <VideoFrame url={url} className={picture} />
        </div>
      ) : (
        <img
          src={url}
          alt={t('samy_attached_image', 'Attached image {{n}}', {
            n: position,
          })}
          // Chrome reports a picture dragged inside the page as a file, which
          // would come back as a new upload of the same image.
          draggable={false}
          className={picture}
        />
      )}
      {isVideo && !uploading && <PlayBadge />}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loading height={24} width={24} type="spin" color="var(--brand)" />
        </div>
      )}
      {/* The circle stays 22px; under a coarse pointer the button around it
          grows to 44px and its inset shrinks by the same amount, so the circle
          does not move. */}
      <button
        type="button"
        onClick={() => remove(tile.key)}
        aria-label={t('samy_remove_attachment', 'Remove attachment {{n}}', {
          n: position,
        })}
        className="group absolute top-[6px] end-[6px] w-[22px] h-[22px] coarse:w-[44px] coarse:h-[44px] coarse:-top-[5px] coarse:-end-[5px] flex items-center justify-center rounded-full cursor-pointer focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="w-[22px] h-[22px] rounded-full bg-black/[0.62] group-hover:bg-black/[0.82] text-white flex items-center justify-center transition-colors">
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
    </div>
  );
};

/** The row above the text, which scrolls sideways when it runs out of room. */
export const AttachmentsTray: FC = () => {
  const { tiles } = useAttachments();
  const row = useRef<HTMLDivElement>(null);
  const showing = !!tiles.length;

  // The row takes its room from the chat, and the chat's own scrolling watches only
  // its messages, so the latest reply would slip under the box.
  useLayoutEffect(() => {
    if (row.current) {
      followChatBottom(
        row.current
          .closest('.copilotKitChatBody')
          ?.querySelector('.copilotKitMessages'),
        row.current.offsetHeight
      );
    }
  }, [showing]);

  if (!showing) {
    return null;
  }

  return (
    <div
      ref={row}
      className="flex gap-[10px] phone:gap-[8px] pt-[12px] px-[12px] overflow-x-auto cursor-default [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tiles.map((tile, index) => (
        <AttachmentTile key={tile.key} tile={tile} position={index + 1} />
      ))}
    </div>
  );
};

// Not copilotKitInputControlButton: `.agent` paints that class's last child as
// Send, and its row needs these to size to their labels at every width.
const TOOL_BUTTON =
  'inline-flex flex-none items-center gap-[6px] h-[32px] coarse:h-[44px] phone:h-[44px] px-[10px] phone:px-[12px] rounded-[8px] border text-[12px] phone:text-[13px] font-[600] whitespace-nowrap cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-brand [@media(max-width:400px)]:px-[8px] [@media(max-width:400px)]:gap-[4px] [@media(max-width:400px)]:text-[12px]';
const TOOL_ICON =
  'flex-none w-[16px] h-[16px] phone:w-[20px] phone:h-[20px] [@media(max-width:340px)]:hidden';

/** The box's two labelled buttons. */
export const AttachmentTools: FC<{ value: string }> = ({ value }) => {
  const t = useT();
  const user = useUser();
  const modals = useModals();
  const { addMedia } = useAttachments();

  // Opened the way MultiMediaComponent opens the library.
  const pick = () => {
    modals.openModal({
      title: t('media_library', 'Media Library'),
      askClose: false,
      closeOnEscape: true,
      fullScreen: true,
      size: mediaLibrarySize(),
      height: mediaLibrarySize(),
      children: (close) => <MediaBox setMedia={addMedia} closeModal={close} />,
    });
  };

  return (
    // As wide as its buttons: the input's row ends in a growing spacer before
    // Send, and a growing toolbar would split the free space with it. min-w-0
    // lets it give way when the row is narrower still.
    <div className="flex items-center gap-[6px] min-w-0">
      <button
        type="button"
        onClick={pick}
        className={clsx(
          TOOL_BUTTON,
          'bg-surface border-line text-ink hover:border-inkSoft'
        )}
      >
        <InsertMediaIcon className={TOOL_ICON} />
        <span>{t('insert_media', 'Insert Media')}</span>
      </button>
      {!!user?.tier?.ai && (
        <AiImage
          value={value}
          onChange={addMedia}
          renderTrigger={(open, loading) => (
            <button
              type="button"
              onClick={open}
              disabled={loading}
              className={clsx(
                TOOL_BUTTON,
                'bg-aiSoft border-transparent text-aiAccent hover:border-aiAccent'
              )}
            >
              {loading ? (
                <Loading
                  height={16}
                  width={16}
                  type="spin"
                  color="currentColor"
                />
              ) : (
                <AiImageIcon className={TOOL_ICON} />
              )}
              <span>{t('samy_ai_image', 'AI Image')}</span>
            </button>
          )}
        />
      )}
    </div>
  );
};

/** What the chat column shows while files are dragged over it. */
export const AttachmentsDropOverlay: FC = () => {
  const t = useT();

  return (
    <div className="absolute inset-[10px] z-[60] flex flex-col items-center justify-center gap-[6px] p-[16px] border-2 border-dashed border-brand rounded-[16px] bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] backdrop-blur-[3px] text-ink text-center pointer-events-none">
      <span className="w-[44px] h-[44px] mb-[6px] rounded-[12px] bg-brandSoft2 text-brandText flex items-center justify-center">
        <InsertMediaIcon size={24} />
      </span>
      <span className="text-[16px] font-[600]">
        {t('samy_drop_title', 'Drop your images here')}
      </span>
      <span className="text-[13px] text-muted">
        {t('samy_drop_subtitle', "They'll be added to your message")}
      </span>
    </div>
  );
};
