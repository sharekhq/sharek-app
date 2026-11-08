'use client';

import { FC, useContext, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { useCopilotContext } from '@copilotkit/react-core';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import {
  ChatOptions,
  ChatTitleField,
  useChatActions,
  useChats,
} from '@gitroom/frontend/components/agents/agent.chats';
import { useChatRun } from '@gitroom/frontend/components/agents/agent.created.media';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import { PlusIcon } from '@gitroom/frontend/components/ui/icons';

/**
 * The open chat's bar, above its messages (contracts/pages-ui.md, R15): its
 * title and its ⋯, with the history's Rename and Pin (C22). At 1025px and
 * below it's the page's one bar: Chats, which opens the history's drawer, the
 * title, ⋯ and New chat. On a wide screen Chats shows only while the history
 * is hidden.
 *
 * Inside CopilotKit it knows the open chat even at /agents/new, and writes its
 * id to `Agent`'s context for the history (C21). Inside ChatRunProvider it
 * sees each reply end and reloads the list, so the chat moves to the top of
 * its group and a new one shows its title (R14, C23).
 */
export const ChatHeader: FC = () => {
  const t = useT();
  const { threadId } = useCopilotContext();
  const { setThreadId, chatsHidden, openChats } = useContext(PropertiesContext);
  const { data, mutate } = useChats();
  const { pin } = useChatActions();
  const { running } = useChatRun();
  const ran = useRef(running);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    setThreadId(threadId);
  }, [threadId, setThreadId]);

  useEffect(() => {
    if (ran.current && !running) {
      mutate();
    }
    ran.current = running;
  }, [running, mutate]);

  // The list has the chat once its first reply is saved; until then it has
  // no title to show and nothing to rename or pin.
  const chat = data?.threads.find((item) => item.id === threadId);

  return (
    <div className="flex-none flex items-center gap-[6px] mobile:gap-[4px] h-[56px] mobile:h-[52px] ps-[20px] pe-[16px] mobile:ps-[6px] mobile:pe-[6px] border-b border-line">
      <button
        type="button"
        aria-label={t('show_chats', 'Show chats')}
        onClick={openChats}
        className={clsx(
          chatsHidden ? 'flex' : 'hidden mobile:flex',
          'flex-none items-center gap-[6px] h-[36px] mobile:h-[44px] coarse:h-[44px] px-[10px] rounded-[8px] text-ink text-[14px] font-[600] hover:bg-surface2 transition-colors cursor-pointer',
          FOCUS_RING
        )}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
        {t('chats', 'Chats')}
      </button>
      {renaming && chat ? (
        <div className="flex-1 min-w-0">
          <ChatTitleField chat={chat} onClose={() => setRenaming(false)} />
        </div>
      ) : (
        <>
          {/* Its own width on a wide screen, so the ⋯ follows it; the room
              between Chats and New chat at 1025px and below. The title cuts
              itself, so the ellipsis falls at its own end. */}
          <h2 className="flex min-w-0 mobile:flex-1 text-[15px] font-[600] text-ink">
            <span dir="auto" className="truncate">
              {chat?.title || t('new_chat', 'New chat')}
            </span>
          </h2>
          {chat && (
            <ChatOptions
              chat={chat}
              onRename={() => setRenaming(true)}
              onPin={() => pin(chat, !chat.pinned)}
              triggerClassName={clsx(
                'flex-none flex items-center justify-center w-[28px] h-[28px] mobile:w-[44px] mobile:h-[44px] coarse:w-[44px] coarse:h-[44px] rounded-[6px] mobile:rounded-[8px] text-muted hover:bg-surface2 hover:text-ink transition-colors cursor-pointer',
                FOCUS_RING
              )}
            />
          )}
        </>
      )}
      {/* the history's New chat, which is in the drawer at 1025px and below */}
      <Link
        href="/agents/new"
        aria-label={t('new_chat', 'New chat')}
        className={clsx(
          'hidden mobile:flex flex-none items-center justify-center w-[44px] h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink transition-colors',
          FOCUS_RING
        )}
      >
        <PlusIcon size={20} aria-hidden="true" />
      </Link>
    </div>
  );
};

/**
 * The message box's "Samy will use" line (contracts/pages-ui.md, R16): the
 * first three pictures of the channels Samy will use, the customer's name
 * when they're all one customer's, else the first channel's, and how many.
 * Choosing it opens the channel list (FR-026).
 */
export const ChannelSummary: FC = () => {
  const t = useT();
  const { properties, openChannels } = useContext(PropertiesContext);
  const picks: Integrations[] = properties;
  const customer = picks[0]?.customer;
  const names =
    customer?.id && picks.every((pick) => pick.customer?.id === customer.id)
      ? customer.name
      : picks[0]?.name;
  const channels = t('channels_count', '{{count}} channels', {
    count: picks.length,
  });

  return (
    // the box's own inset, above the images and the text
    <div className="flex pt-[10px] px-[12px]">
      <button
        type="button"
        onClick={openChannels}
        aria-label={
          picks.length
            ? t(
                'samy_will_use_label',
                'Samy will use {{names}}, {{channels}}. Change channels',
                {
                  names,
                  channels,
                  // React escapes the label, so i18next mustn't first
                  interpolation: { escapeValue: false },
                }
              )
            : undefined
        }
        className={clsx(
          'flex items-center gap-[8px] min-w-0 h-[30px] coarse:h-[44px] rounded-full bg-surface2 text-[13px] text-inkSoft whitespace-nowrap hover:text-ink transition-colors cursor-pointer',
          picks.length ? 'ps-[6px] pe-[10px]' : 'px-[10px]',
          FOCUS_RING
        )}
      >
        {picks.length ? (
          <>
            {/* overlapped from the start edge, the right in Arabic */}
            <span aria-hidden="true" className="flex flex-none">
              {picks.slice(0, 3).map((pick, index) => (
                <ImageWithFallback
                  key={pick.id}
                  fallbackSrc={`/icons/platforms/${pick.identifier}.png`}
                  src={pick.picture}
                  alt=""
                  width={22}
                  height={22}
                  className={clsx(
                    'rounded-[6px] border-2 border-surface2',
                    index > 0 && '-ms-[7px]'
                  )}
                />
              ))}
            </span>
            {t('samy_will_use', 'Samy will use')}
            {/* a name in either script, cut before the count is */}
            <bdi className="min-w-0 truncate font-[600] text-ink">{names}</bdi>
            {`· ${channels}`}
          </>
        ) : (
          t('no_channels_picked', 'No channels picked')
        )}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-none"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
};
