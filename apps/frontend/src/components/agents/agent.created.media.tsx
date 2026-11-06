'use client';

import React, {
  createContext,
  CSSProperties,
  FC,
  ReactNode,
  SyntheticEvent,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { isMediaLink } from '@gitroom/helpers/utils/extract.agent.message.text';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { mediaPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_ASPECT_PRESETS,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import { VIDEO_ORIENTATIONS } from '@gitroom/nestjs-libraries/dtos/videos/video.orientation.catalog';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';

/**
 * Whether a run is going. A card can't ask `useCopilotChatInternal`, because each
 * instance detaches the running reply when it unmounts, and cards come and go. So
 * this comes from the instance `LoadMessages` already holds.
 */
export const ChatRunContext = createContext<{
  running: boolean;
  setRunning: (running: boolean) => void;
}>({ running: false, setRunning: () => {} });

export const ChatRunProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [running, setRunning] = useState(false);

  return (
    <ChatRunContext.Provider value={{ running, setRunning }}>
      {children}
    </ChatRunContext.Provider>
  );
};

export const useChatRun = () => useContext(ChatRunContext);

/**
 * Whether a card with no result may still wait. CopilotKit reports `InProgress`
 * for ever when a call has no result, so this is what ends a stopped card.
 */
export const CardMayWaitContext = createContext(false);

/**
 * A stopped call stays in the chat's messages with no result, so a run alone would
 * bring its card back on the old message. Only the latest exchange can be waiting.
 */
export const isInLatestExchange = (
  messages: { id: string; role: string }[] = [],
  id?: string
) =>
  messages.findIndex((message) => message.id === id) >
  messages.map((message) => message.role).lastIndexOf('user');

/**
 * For a change the chat's own scrolling doesn't watch. The change has already
 * happened by the time this runs, so the chat counts as having been at the bottom
 * if it's within that much of the end.
 */
export const followChatBottom = (
  chat: Element | null | undefined,
  grewBy: number
) => {
  if (
    chat &&
    chat.scrollHeight - chat.scrollTop - chat.clientHeight <= grewBy
  ) {
    chat.scrollTop = chat.scrollHeight;
  }
};

/** A picture or video getting its size changes no DOM the chat's own scrolling watches. */
const followMediaSize = (media: HTMLElement) =>
  followChatBottom(media.closest('.copilotKitMessages'), media.offsetHeight);

export const keepChatAtBottom = (event: SyntheticEvent<HTMLImageElement>) =>
  followMediaSize(event.currentTarget);

/** What a media link in the chat opens: the Media library's viewer, with that one item. */
export const chatMediaPreview = (url: string) =>
  mediaPreviewModal([{ id: url, path: url, name: url.split('/').pop() }], 0);

/** A catalog's `9:16` as one number, which a card can both take and size itself by. */
const cardRatio = (ratio: string) => {
  const [width, height] = ratio.split(':').map(Number);
  return width / height;
};

/**
 * A row stored before Samy's own tool has no shape, and a value still streaming in
 * is part of a word, so both are the tool's default.
 */
const imageCardRatio = (aspectRatio?: string) =>
  cardRatio(
    IMAGE_ASPECT_PRESETS[
      IMAGE_ASPECT_IDS.find((shape) => shape === aspectRatio) ?? 'square'
    ].ratio
  );

// Container units, because a percentage would be ignored while its parent shrinks
// to fit. The row holds the cards as its own children, so one alone can tell.
const MEDIA_LIMITS =
  'block w-auto h-auto max-w-[190px] phone:max-w-[150px] group-only:max-w-[min(420px,100cqw)] max-h-[480px] rounded-[16px]';

const UNAVAILABLE =
  'p-[12px] rounded-[16px] bg-surface2 text-muted text-[12px]';

const CARD_TITLE = 'text-[14px] font-[600] text-ink';
const CARD_SUBTITLE = 'text-[12px] text-muted';

/** What stands where media is on its way or can't come. No icon, as the preview has none. */
const MediaCard: FC<{
  ratio: number;
  waiting?: boolean;
  children: ReactNode;
}> = ({ ratio, waiting, children }) => (
  <div
    // A picture stops at 480px tall, so a tall card alone is only as wide as that
    // allows, and the picture lands in the room the card kept.
    className="relative overflow-hidden aspect-[var(--card-ratio)] w-[190px] phone:w-[150px] only:w-[min(420px,calc(480px*var(--card-ratio)),100cqw)] rounded-[16px]"
    style={{ '--card-ratio': ratio } as CSSProperties}
  >
    <div
      className={clsx(
        'absolute inset-0 bg-surface2',
        waiting && 'motion-safe:animate-pulse'
      )}
    />
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] p-[16px] text-center leading-[1.4]">
      {children}
    </div>
  </div>
);

export const CreatedImage: FC<{
  result?: { path?: string };
  args?: { aspectRatio?: string };
}> = ({ result, args }) => {
  const t = useT();
  const modals = useModals();
  const mayWait = useContext(CardMayWaitContext);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // CopilotKit parses a JSON result and leaves anything else as a string.
  const link = result?.path;
  const path = isMediaLink(link) ? link : undefined;

  if (path && failed) {
    return (
      <div className={UNAVAILABLE}>
        {t('samy_image_unavailable', 'This image is no longer available')}
      </div>
    );
  }

  // A picture holds no size until it has downloaded, so the card keeps the chat's
  // room until then. A reopened chat has no card to keep, so its picture comes at once.
  if (path && (loaded || !mayWait)) {
    return (
      <button
        type="button"
        onClick={() => modals.openModal(chatMediaPreview(path))}
        aria-label={t('samy_created_image', 'Image Samy made')}
        className="group block relative rounded-[16px] cursor-zoom-in focus-visible:ring-2 focus-visible:ring-brand after:content-[''] after:absolute after:inset-0 after:rounded-[16px] after:border after:border-line after:pointer-events-none"
      >
        <img
          src={path}
          alt=""
          // Chrome reports a picture dragged inside the page as a file, which
          // would come back through the drop zone as a new upload.
          draggable={false}
          onError={() => setFailed(true)}
          // After a card its size is known at once, and that change is one the
          // chat's own scrolling watches.
          onLoad={loaded ? undefined : keepChatAtBottom}
          className={MEDIA_LIMITS}
        />
      </button>
    );
  }

  if (!path && (result || !mayWait)) {
    return null;
  }

  return (
    <MediaCard ratio={imageCardRatio(args?.aspectRatio)} waiting>
      <span className={CARD_TITLE}>
        {t('creating_your_image', 'Creating your image…')}
      </span>
      <span className={CARD_SUBTITLE}>
        {t('usually_takes_half_minute', 'Usually takes about half a minute')}
      </span>
      {path && (
        <img
          src={path}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </MediaCard>
  );
};

const VIDEO_CHECK_EVERY = 10 * 1000;
const VIDEO_CHECK_LIMIT = 45 * 60 * 1000;

type VideoStatus = {
  status: 'pending' | 'completed' | 'failed' | 'missing';
  path?: string;
};

/**
 * A failed check answers what the last one did, or pending, because SWR doesn't
 * revalidate while its cache holds an error, so one network blip would leave a card
 * waiting out its limit, and an error's place in the cache can't be a playing video's.
 * A focus or reconnect stays out of it, or a playing video could flip to the pointer
 * once its status has gone.
 */
const useVideoStatus = (jobId: string | undefined, active: boolean) => {
  const fetch = useFetch();
  const { cache } = useSWRConfig();
  const key = jobId ? `/media/generate-video/${jobId}/status` : null;
  const known: VideoStatus | undefined = key ? cache.get(key)?.data : undefined;

  const load = useCallback(
    async (url: string): Promise<VideoStatus> => {
      try {
        const response = await fetch(url);
        if (response.status === 404) {
          return { status: 'missing' };
        }
        if (response.ok) {
          return await response.json();
        }
      } catch {
        // The same as a failed answer.
      }
      return cache.get(url)?.data ?? { status: 'pending' };
    },
    [fetch, cache]
  );

  return useSWR<VideoStatus>(key, load, {
    // A number, because SWR restarts its timer when this changes: a new function on
    // every render would keep a page that draws often from reaching the next check.
    refreshInterval:
      active && (known?.status ?? 'pending') === 'pending'
        ? VIDEO_CHECK_EVERY
        : 0,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
};

const PlayableVideo: FC<{ path: string }> = ({ path }) => {
  const t = useT();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={UNAVAILABLE}>
        {t('samy_video_unavailable', 'This video is no longer available')}
      </div>
    );
  }

  return (
    <div className="group">
      <VideoFrame
        url={path}
        controls={true}
        playsInline={true}
        onError={() => setFailed(true)}
        onLoadedMetadata={followMediaSize}
        className={MEDIA_LIMITS}
      />
    </div>
  );
};

export const CreatedVideo: FC<{
  result?: { jobId?: string; startedAt?: string };
  args?: { output?: string };
}> = ({ result, args }) => {
  const t = useT();
  const mayWait = useContext(CardMayWaitContext);
  const jobId = result?.jobId;
  // A reopened card brings when it started, and a live one is starting now.
  const [startedAt] = useState(
    () => Date.parse(result?.startedAt as string) || Date.now()
  );
  const [expired, setExpired] = useState(
    () => Date.now() - startedAt >= VIDEO_CHECK_LIMIT
  );
  const { data } = useVideoStatus(jobId, !expired);

  // A clock, because another `pending` from a check changes nothing on the page.
  useEffect(() => {
    if (!jobId || expired) {
      return;
    }
    const timer = setTimeout(
      () => setExpired(true),
      startedAt + VIDEO_CHECK_LIMIT - Date.now()
    );
    return () => clearTimeout(timer);
  }, [jobId, expired, startedAt]);

  // Refused, or stopped before the render began. A job outlives its run, so a card
  // with one goes on whether or not a run is going.
  if (!jobId && (result || !mayWait)) {
    return null;
  }

  if (data?.status === 'completed' && isMediaLink(data.path)) {
    return <PlayableVideo path={data.path} />;
  }

  const ratio = cardRatio(
    VIDEO_ORIENTATIONS[
      args?.output === 'horizontal' ? 'horizontal' : 'vertical'
    ].ratio
  );

  if (data?.status === 'failed') {
    return (
      <MediaCard ratio={ratio}>
        <span className={CARD_TITLE}>
          {t('samy_video_failed', "This video couldn't be made")}
        </span>
      </MediaCard>
    );
  }

  if (!data || (data.status === 'pending' && !expired)) {
    return (
      <MediaCard ratio={ratio} waiting>
        <span className={CARD_TITLE}>
          {t('samy_video_rendering', 'Your video is rendering')}
        </span>
        <span className={CARD_SUBTITLE}>
          {t(
            'samy_video_rendering_sub',
            "It will play here when it's ready. You can keep chatting."
          )}
        </span>
      </MediaCard>
    );
  }

  // A failed render ends as not found too, so this can't promise the video exists.
  return (
    <MediaCard ratio={ratio}>
      <span className={CARD_SUBTITLE}>
        {t(
          'samy_video_pointer',
          "If this video finished, it's in your Media library"
        )}
      </span>
      <Link
        href="/media"
        className="text-[12px] font-[600] text-ink underline rounded-[4px] focus-visible:ring-2 focus-visible:ring-brand"
      >
        {t('media_library', 'Media Library')}
      </Link>
    </MediaCard>
  );
};

/** A video Samy reports as finished plays in that reply. Anything else, its words say. */
export const ReportedVideo: FC<{
  result?: { status?: string; url?: string };
}> = ({ result }) =>
  result?.status === 'completed' && isMediaLink(result.url) ? (
    <PlayableVideo path={result.url} />
  ) : null;

/**
 * Draws the server's own tool, and offers the model nothing by this name. CopilotKit
 * registers a new renderer whenever this object changes, and a new renderer remounts
 * the card, so it's one object out here rather than a new one on every render of `Hooks`.
 */
export const createdImageAction = {
  name: 'generateImageTool',
  available: 'disabled' as const,
  render: ({
    result,
    args,
  }: {
    result?: { path?: string };
    args?: { aspectRatio?: string };
  }) => <CreatedImage result={result} args={args} />,
};

export const createdVideoAction = {
  name: 'generateVideoTool',
  available: 'disabled' as const,
  render: ({
    result,
    args,
  }: {
    result?: { jobId?: string; startedAt?: string };
    args?: { output?: string };
  }) => <CreatedVideo result={result} args={args} />,
};

export const reportedVideoAction = {
  name: 'videoStatusTool',
  available: 'disabled' as const,
  render: ({ result }: { result?: { status?: string; url?: string } }) => (
    <ReportedVideo result={result} />
  ),
};

/** Whether the message's own card says it's working, which the chat's dots would repeat. */
export const drawsWaitingCard = (message?: {
  toolCalls?: { function: { name: string } }[];
}) =>
  !!message?.toolCalls?.some((call) =>
    [createdImageAction.name, createdVideoAction.name].includes(
      call.function.name
    )
  );
