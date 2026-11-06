'use client';

import React, {
  createContext,
  CSSProperties,
  FC,
  ReactNode,
  SyntheticEvent,
  useContext,
  useState,
} from 'react';
import { isMediaLink } from '@gitroom/helpers/utils/extract.agent.message.text';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { mediaPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_ASPECT_PRESETS,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

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

/** An image load changes no DOM the chat's own scrolling watches. */
export const keepChatAtBottom = (event: SyntheticEvent<HTMLImageElement>) => {
  const picture = event.currentTarget;
  followChatBottom(
    picture.closest('.copilotKitMessages'),
    picture.offsetHeight
  );
};

/** What a media link in the chat opens: the Media library's viewer, with that one item. */
export const chatMediaPreview = (url: string) =>
  mediaPreviewModal([{ id: url, path: url, name: url.split('/').pop() }], 0);

/**
 * The shape being made, as one number the card can both take and size itself by.
 * A row stored before Samy's own tool has none, and a value still streaming in is
 * part of a word, so both are the tool's default.
 */
const cardRatio = (aspectRatio?: string) => {
  const id =
    IMAGE_ASPECT_IDS.find((shape) => shape === aspectRatio) ?? 'square';
  const [width, height] = IMAGE_ASPECT_PRESETS[id].ratio.split(':').map(Number);
  return width / height;
};

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
      <div className="p-[12px] rounded-[16px] bg-surface2 text-muted text-[12px]">
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
          // Container units, because a percentage would be ignored while the button
          // shrinks to fit the picture. The row holds the cards as its own children,
          // so one alone can tell.
          className="block w-auto h-auto max-w-[190px] phone:max-w-[150px] group-only:max-w-[min(420px,100cqw)] max-h-[480px] rounded-[16px]"
        />
      </button>
    );
  }

  if (!path && (result || !mayWait)) {
    return null;
  }

  return (
    <div
      // A picture stops at 480px tall, so a tall card alone is only as wide as that
      // allows, and the picture lands in the room the card kept.
      className="relative overflow-hidden aspect-[var(--card-ratio)] w-[190px] phone:w-[150px] only:w-[min(420px,calc(480px*var(--card-ratio)),100cqw)] rounded-[16px]"
      style={{ '--card-ratio': cardRatio(args?.aspectRatio) } as CSSProperties}
    >
      <div className="absolute inset-0 bg-surface2 motion-safe:animate-pulse" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] p-[16px] text-center leading-[1.4]">
        <span className="text-[14px] font-[600] text-ink">
          {t('creating_your_image', 'Creating your image…')}
        </span>
        <span className="text-[12px] text-muted">
          {t('usually_takes_half_minute', 'Usually takes about half a minute')}
        </span>
      </div>
      {path && (
        <img
          src={path}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="hidden"
        />
      )}
    </div>
  );
};

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

/** Whether the message's own card says it's working, which the chat's dots would repeat. */
export const drawsWaitingCard = (message?: {
  toolCalls?: { function: { name: string } }[];
}) =>
  !!message?.toolCalls?.some(
    (call) => call.function.name === createdImageAction.name
  );
