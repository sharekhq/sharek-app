'use client';

import React, {
  createContext,
  FC,
  ReactNode,
  SyntheticEvent,
  useContext,
  useState,
} from 'react';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { mediaPreviewModal } from '@gitroom/frontend/components/media/media.preview';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

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
 * An image load changes no DOM the chat's own scrolling watches. The list has
 * already grown by the time this runs, so the chat counts as having been at the
 * bottom if it's within the picture's own height of the end.
 */
export const keepChatAtBottom = (event: SyntheticEvent<HTMLImageElement>) => {
  const picture = event.currentTarget;
  const chat = picture.closest('.copilotKitMessages');
  if (!chat) {
    return;
  }

  const fromEnd = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
  if (fromEnd <= picture.offsetHeight) {
    chat.scrollTop = chat.scrollHeight;
  }
};

/** What a media link in the chat opens: the Media library's viewer, with that one item. */
export const chatMediaPreview = (url: string) =>
  mediaPreviewModal([{ id: url, path: url, name: url.split('/').pop() }], 0);

export const CreatedImage: FC<{ result?: { path?: string } }> = ({ result }) => {
  const t = useT();
  const modals = useModals();
  const mayWait = useContext(CardMayWaitContext);
  const [failed, setFailed] = useState(false);
  // CopilotKit parses a JSON result and leaves anything else as a string.
  const path = result?.path;

  if (path && failed) {
    return (
      <div className="p-[12px] rounded-[16px] bg-surface2 text-muted text-[12px]">
        {t('samy_image_unavailable', 'This image is no longer available')}
      </div>
    );
  }

  if (path) {
    return (
      <button
        type="button"
        onClick={() => modals.openModal(chatMediaPreview(path))}
        aria-label={t('samy_created_image', 'Image Samy made')}
        className="group block relative w-fit leading-[0] rounded-[16px] cursor-zoom-in focus-visible:ring-2 focus-visible:ring-brand after:content-[''] after:absolute after:inset-0 after:rounded-[16px] after:border after:border-line after:pointer-events-none"
      >
        <img
          src={path}
          alt=""
          // Chrome reports a picture dragged inside the page as a file, which
          // would come back through the drop zone as a new upload.
          draggable={false}
          onError={() => setFailed(true)}
          onLoad={keepChatAtBottom}
          // Viewport units, because a percentage would be ignored while the button
          // shrinks to fit the picture. The row holds the cards as its own children,
          // so one alone can tell.
          className="block w-auto h-auto max-w-[190px] phone:max-w-[150px] group-only:max-w-[min(420px,calc(100vw-72px))] max-h-[480px] rounded-[16px]"
        />
      </button>
    );
  }

  if (result || !mayWait) {
    return null;
  }

  return (
    <div className="relative overflow-hidden aspect-square w-[190px] phone:w-[150px] only:w-[min(420px,calc(100vw-72px))] rounded-[16px]">
      <div className="absolute inset-0 bg-surface2 motion-safe:animate-pulse" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] p-[16px] text-center leading-[1.4]">
        <span className="text-[14px] font-[600] text-ink">
          {t('creating_your_image', 'Creating your image…')}
        </span>
        <span className="text-[12px] text-muted">
          {t('usually_takes_half_minute', 'Usually takes about half a minute')}
        </span>
      </div>
    </div>
  );
};

/**
 * CopilotKit's memo compares this function, so it lives out here rather than being
 * made again on every render of `Hooks`.
 */
export const renderCreatedImage = ({
  result,
}: {
  result?: { path?: string };
}) => <CreatedImage result={result} />;
