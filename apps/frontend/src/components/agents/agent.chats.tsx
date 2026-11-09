'use client';

import {
  FC,
  KeyboardEvent,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { groupBy } from 'lodash';
import Link from 'next/link';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { isAlreadyAnswered } from '@gitroom/helpers/utils/custom.fetch.func';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import {
  FOCUS_RING,
  matchesSearch,
  SearchField,
} from '@gitroom/frontend/components/launches/channel.panel';
import { PostActionsMenu } from '@gitroom/frontend/components/launches/post.actions.menu';
import {
  CloseIcon,
  PencilIcon,
  PlusIcon,
} from '@gitroom/frontend/components/ui/icons';

// A chat as GET /copilot/list gives it (contracts/chat-threads-api.md).
export interface Chat {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
}

// The workspace's chats, last used first, under the key the chat header
// revalidates when a reply ends (R14).
export const useChats = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/copilot/list')).json();
  }, [fetch]);
  return useSWR<{ threads: Chat[] }>('threads', load);
};

// Rename and pin, for the history and the chat header alike (C22). Each
// changes the list at once, and puts the chat back if the save fails.
export const useChatActions = () => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const { mutate } = useChats();

  const save = useCallback(
    async (
      id: string,
      route: 'title' | 'pin',
      change: Partial<Chat>,
      undo: Partial<Chat>
    ) => {
      const set = (values: Partial<Chat>) =>
        mutate(
          (list) =>
            list && {
              threads: list.threads.map((chat) =>
                chat.id === id ? { ...chat, ...values } : chat
              ),
            },
          false
        );
      set(change);
      try {
        const response = await fetch(`/copilot/${id}/${route}`, {
          method: 'PUT',
          body: JSON.stringify(change),
        });
        if (!response.ok) {
          throw new Error();
        }
      } catch (e) {
        set(undo);
        // the fetch interceptor has already answered (the limit modal, a
        // redirect), and a toast on top would say less
        if (!isAlreadyAnswered(e)) {
          toast.show(
            t('error_occurred', 'An error occurred. Please try again.'),
            'warning'
          );
        }
      }
    },
    [fetch, mutate, toast, t]
  );

  return {
    rename: (chat: Chat, title: string) =>
      save(chat.id, 'title', { title }, { title: chat.title }),
    pin: (chat: Chat, pinned: boolean) =>
      save(chat.id, 'pin', { pinned }, { pinned: chat.pinned }),
  };
};

// A chat's name edited in place, in its row or in the chat header (C22).
// Enter or leaving the field saves the trimmed name, Escape cancels, and an
// empty or unchanged name sends nothing, so the old title stays.
export const ChatTitleField: FC<{ chat: Chat; onClose: () => void }> = ({
  chat,
  onClose,
}) => {
  const t = useT();
  const { rename } = useChatActions();
  const [value, setValue] = useState(chat.title);
  const cancelled = useRef(false);

  // Both keys end the edit by leaving the field, so it ends in one place.
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // the field's alone, or the drawer around it would close too
      e.stopPropagation();
      cancelled.current = true;
      e.currentTarget.blur();
    } else if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const close = () => {
    const title = value.trim();
    if (!cancelled.current && title && title !== chat.title) {
      rename(chat, title);
    }
    onClose();
  };

  return (
    <input
      autoFocus
      dir="auto"
      value={value}
      aria-label={t('rename', 'Rename')}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={keys}
      onBlur={close}
      className="w-full h-[32px] coarse:h-[44px] px-[8px] rounded-[6px] border border-brand ring-[3px] ring-brandSoft bg-newBgColorInner text-[14px] coarse:text-[16px] text-ink outline-none"
    />
  );
};

// on a pinned chat's row, and on its menu's Pin
const PinIcon: FC<{ size: number; className?: string }> = ({
  size,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />
    <path d="M12 14v6" />
  </svg>
);

// A chat's ⋯, in its row and in the chat header (C22): Rename, which the
// caller turns into ChatTitleField where the title sits, and Pin to top or
// Unpin. The caller pins, through a list it already holds: a menu reading
// the list itself would load it again as its row moves group, and put back
// the old values before the save is answered.
export const ChatOptions: FC<{
  chat: Chat;
  onRename: () => void;
  onPin: () => void;
  triggerClassName: string;
}> = ({ chat, onRename, onPin, triggerClassName }) => {
  const t = useT();

  return (
    <PostActionsMenu
      label={t('chat_options', 'Chat options')}
      triggerClassName={triggerClassName}
      trigger={
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      }
      actions={[
        {
          key: 'rename',
          icon: (
            <PencilIcon size={16} aria-hidden="true" className="text-muted" />
          ),
          label: t('rename', 'Rename'),
          onClick: onRename,
        },
        {
          key: 'pin',
          icon: <PinIcon size={16} className="text-muted" />,
          label: chat.pinned
            ? t('unpin', 'Unpin')
            : t('pin_to_top', 'Pin to top'),
          onClick: onPin,
        },
      ]}
    />
  );
};

// A chat: its title, which opens it, a pin mark when pinned, and its ⋯. The
// open chat has the selected tint; the others show a hover.
const ChatRow: FC<{ chat: Chat; current: boolean; onPin: () => void }> = ({
  chat,
  current,
  onPin,
}) => {
  const t = useT();
  const { closeChats } = useContext(PropertiesContext);
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <div className="flex items-center min-h-[36px] coarse:min-h-[44px] px-[4px]">
        <ChatTitleField chat={chat} onClose={() => setRenaming(false)} />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group flex items-center gap-[4px] pe-[4px] rounded-[8px] transition-colors',
        current
          ? 'bg-brandSoft2 text-ink font-[600]'
          : 'text-inkSoft hover:bg-boxHover hover:text-ink'
      )}
    >
      {/* Picking a chat closes the drawer it may be in. */}
      <Link
        href={`/agents/${chat.id}`}
        aria-current={current ? 'page' : undefined}
        onClick={closeChats}
        className={clsx(
          'flex-1 min-w-0 flex items-center min-h-[36px] coarse:min-h-[44px] ps-[10px] rounded-[8px]',
          FOCUS_RING
        )}
      >
        {/* The title cuts itself, so the ellipsis falls at its own end. */}
        <span dir="auto" className="truncate text-[14px]">
          {chat.title || t('new_chat', 'New chat')}
        </span>
      </Link>
      {chat.pinned && <PinIcon size={14} className="flex-none text-muted" />}
      {/* The ⋯ shows on its row's hover, while the focus is anywhere in its
          row, on the link or on itself, and always on a touch screen. */}
      <span className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 coarse:opacity-100 transition-opacity">
        <ChatOptions
          chat={chat}
          onRename={() => setRenaming(true)}
          onPin={onPin}
          triggerClassName={clsx(
            'flex items-center justify-center w-[28px] h-[28px] coarse:w-[44px] coarse:h-[44px] rounded-[6px] text-muted hover:text-ink cursor-pointer',
            FOCUS_RING
          )}
        />
      </span>
    </div>
  );
};

type Group = 'pinned' | 'today' | 'yesterday' | 'week' | 'older';
const GROUPS: Group[] = ['pinned', 'today', 'yesterday', 'week', 'older'];

/**
 * Samy's chat history (contracts/pages-ui.md): a header with Hide chats on
 * the rail and Close on the drawer, New chat, the search, then the chats
 * grouped Pinned, Today, Yesterday, Previous 7 days and Older.
 *
 * It draws its own header, because `SplitPanel` draws none (C6), and reads
 * the open chat and the hide and close from `Agent`'s context (C21).
 */
export const ChatsPanel: FC = () => {
  const t = useT();
  const { data } = useChats();
  const { pin } = useChatActions();
  const { threadId, hideChats, closeChats } = useContext(PropertiesContext);
  const [search, setSearch] = useState('');

  // by what each row shows, so a chat not yet named is found as New chat
  const query = search.trim();
  const chats = (data?.threads || []).filter((chat) =>
    matchesSearch(chat.title || t('new_chat', 'New chat'), query)
  );
  // By the day of last use in the user's time zone, Previous 7 days being 2
  // to 7 days ago (data-model.md). Each group keeps the list's order, newest
  // use first.
  const today = newDayjs().startOf('day');
  const starts = [
    ['today', today],
    ['yesterday', today.subtract(1, 'day')],
    ['week', today.subtract(7, 'day')],
  ] as const;
  const grouped = groupBy(chats, (chat): Group => {
    if (chat.pinned) {
      return 'pinned';
    }
    const used = newDayjs(chat.updatedAt);
    return starts.find(([, start]) => !used.isBefore(start))?.[0] || 'older';
  });
  const names: Record<Group, string> = {
    pinned: t('pinned_chats', 'Pinned'),
    today: t('chats_today', 'Today'),
    yesterday: t('chats_yesterday', 'Yesterday'),
    week: t('chats_previous_7_days', 'Previous 7 days'),
    older: t('chats_older', 'Older'),
  };

  return (
    <nav aria-label={t('chats', 'Chats')} className="flex flex-col">
      {/* The header, New chat and the search stay put while the chats scroll
          under them, with the top padding SplitPanel leaves out (C28). Past
          its 8px, each takes the rest of the board's inset itself. */}
      <div className="sticky top-0 z-10 bg-newBgColorInner flex flex-col gap-[8px] pt-[20px] pb-[4px]">
        <div className="flex items-center gap-[4px] ps-[8px] pe-[2px]">
          <h2 className="text-[15px] mobile:text-[17px] font-[600] text-ink">
            {t('chats', 'Chats')}
          </h2>
          {/* the rail's; the drawer closes with Close */}
          <button
            type="button"
            aria-label={t('hide_chats', 'Hide chats')}
            onClick={hideChats}
            className={clsx(
              'ms-auto flex mobile:hidden items-center justify-center w-[36px] h-[36px] coarse:w-[44px] coarse:h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink transition-colors cursor-pointer',
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
              className="rtl:-scale-x-100"
            >
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
              <path d="M16 10l-2 2 2 2" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={t('close', 'Close')}
            onClick={closeChats}
            className={clsx(
              'ms-auto hidden mobile:flex items-center justify-center w-[44px] h-[44px] rounded-[8px] text-muted hover:bg-surface2 hover:text-ink transition-colors cursor-pointer',
              FOCUS_RING
            )}
          >
            <CloseIcon size={18} aria-hidden="true" />
          </button>
        </div>
        {/* /agents, as upstream's Start a new chat: a route of its own, so the
            chat being left unmounts, even one started at /agents/new, and
            /agents sends on to /agents/new, where CopilotKit makes a new
            thread. */}
        <Link
          href="/agents"
          onClick={closeChats}
          className={clsx(
            'mx-[4px] flex items-center gap-[8px] h-[40px] coarse:h-[44px] px-[12px] rounded-[8px] bg-quiet border border-line hover:bg-surface2 transition-colors text-ink text-[14px] font-[600]',
            FOCUS_RING
          )}
        >
          <PlusIcon size={18} aria-hidden="true" />
          {t('new_chat', 'New chat')}
        </Link>
        <SearchField
          label={t('search_chats', 'Search chats')}
          value={search}
          onChange={setSearch}
        />
      </div>
      {GROUPS.filter((group) => grouped[group]).map((group) => (
        <div key={group} role="group" aria-label={names[group]}>
          <div
            aria-hidden="true"
            className="px-[10px] pt-[14px] pb-[6px] text-[12px] font-[600] text-muted"
          >
            {names[group]}
          </div>
          {grouped[group].map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              current={chat.id === threadId}
              onPin={() => pin(chat, !chat.pinned)}
            />
          ))}
        </div>
      ))}
      {!!query && !chats.length && (
        <p className="py-[24px] px-[16px] text-center text-[13px] text-muted">
          {t('no_chat_matches', 'No chat matches')}
        </p>
      )}
    </nav>
  );
};
