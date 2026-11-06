'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { omit } from 'lodash';
import {
  AssistantMessage,
  AssistantMessageProps,
  CopilotChat,
  CopilotKitCSSProperties,
  InputProps,
  UserMessageProps,
} from '@copilotkit/react-ui';
import { Input } from '@gitroom/frontend/components/agents/agent.input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  CopilotKit,
  useCopilotAction,
  useCopilotChatInternal,
} from '@copilotkit/react-core';
import { PropertiesContext } from '@gitroom/frontend/components/agents/agent';
import {
  AttachmentsDropOverlay,
  AttachmentsProvider,
  AttachmentsTray,
  AttachmentTools,
  PlayBadge,
  useAttachments,
} from '@gitroom/frontend/components/agents/agent.attachments';
import {
  CardMayWaitContext,
  chatMediaPreview,
  ChatRunProvider,
  createdImageAction,
  isInLatestExchange,
  keepChatAtBottom,
  useChatRun,
} from '@gitroom/frontend/components/agents/agent.created.media';
import { DropFiles } from '@gitroom/frontend/components/layout/drop.files';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  AgentMessageMedia,
  extractAgentMessageMedia,
  extractAgentMessageText,
  storedAgentRowToChatMessages,
  stripIntegrationsBlock,
} from '@gitroom/helpers/utils/extract.agent.message.text';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import i18next from 'i18next';
import { fromUtc } from '@gitroom/frontend/components/layout/set.timezone';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { assistantLabels } from '@gitroom/frontend/components/ui/assistant.labels';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';

export const AgentChat: FC = () => {
  const { backendUrl } = useVariables();
  const params = useParams<{ id: string }>();
  const { properties } = useContext(PropertiesContext);
  const t = useT();

  return (
    <CopilotKit
      {...(params.id === 'new' ? {} : { threadId: params.id })}
      credentials="include"
      runtimeUrl={backendUrl + '/copilot/agent'}
      useSingleEndpoint={true}
      showDevConsole={false}
      agent="postiz"
      properties={{
        integrations: properties,
        // Samy states this language in its system prompt instead of inferring
        // it from the conversation, which it got wrong (Spanish, unprompted).
        language: i18next.language,
      }}
    >
      <Hooks />
      <ChatRunProvider>
        <LoadMessages key={params.id} id={params.id} />
        {/* Keyed by the thread, so unsent attachments leave on a thread switch as
          they do on leaving the page. */}
        <AttachmentsProvider key={params.id}>
          <div
            style={
              {
                '--copilot-kit-primary-color': 'var(--brand)',
                '--copilot-kit-background-color': 'var(--new-bg-color)',
              } as CopilotKitCSSProperties
            }
            className="trz agent bg-newBgColorInner flex flex-col gap-[15px] transition-all flex-1 items-center relative"
          >
            <div className="absolute left-0 w-full h-full pb-[20px]">
              <ChatDropZone>
                <CopilotChat
                  className="w-full h-full"
                  labels={{
                    // The eight shared controls. First, so Samy's own two below always
                    // win. Its custom input reads labels.placeholder, so a missing one is
                    // English in the field the user types into.
                    ...assistantLabels(t),
                    title: t('samy', 'Samy'),
                    initial: t(
                      'samy_welcome_message',
                      "Hi, I'm Samy 👋 — your Sharek assistant. I can plan and schedule one post or many across all your connected channels, and generate images and videos for them. Pick the channels you want from the channels panel, and find our previous conversations in the history panel. You can also use me as an MCP server — see Settings → Developers."
                    ),
                  }}
                  UserMessage={Message}
                  AssistantMessage={Reply}
                  Input={NewInput}
                />
              </ChatDropZone>
            </div>
          </div>
        </AttachmentsProvider>
      </ChatRunProvider>
    </CopilotKit>
  );
};

// Inside the provider, for the files it adds, and inside the wrapper that's
// `absolute`, because the drop zone's own `relative` would fight it.
const ChatDropZone: FC<{ children: ReactNode }> = ({ children }) => {
  const { addFiles } = useAttachments();

  return (
    <DropFiles
      className="w-full h-full"
      noKeyboard={true}
      capture={true}
      overlay={<AttachmentsDropOverlay />}
      onDrop={addFiles}
    >
      {children}
    </DropFiles>
  );
};

type ChatMessage = ReturnType<
  typeof useCopilotChatInternal
>['messages'][number];

// Messages carry these functions once a card has rendered. `setMessages` clones
// with structuredClone, which throws on a function, and CopilotKit's bubble would
// draw the card a second time.
const withoutCards = <T extends object>(message: T) =>
  omit(message, 'generativeUI', 'generativeUIPosition') as T;

// Rendered with the thread id as its key, so each thread starts from nothing:
// a list kept from an earlier visit would miss the exchanges since then.
const LoadMessages: FC<{ id: string }> = ({ id }) => {
  const { messages, setMessages, isAvailable, isLoading } =
    useCopilotChatInternal();
  const { setRunning } = useChatRun();
  const fetch = useFetch();
  // The thread's stored messages, once they arrive; a new thread has none.
  const [stored, setStored] = useState<ChatMessage[] | null>(
    id === 'new' ? [] : null
  );
  // Whether the stored messages are on screen, and what to put back if the
  // chat is emptied while the thread stays open: the stored messages, then the
  // conversation as it grows.
  const written = useRef(false);
  const restore = useRef<ChatMessage[]>([]);

  useEffect(() => {
    if (id === 'new') {
      return;
    }

    fetch(`/copilot/${id}/list`)
      .then((response) => response.json())
      .then((data) => {
        setStored(
          data.messages.flatMap((row: any) => storedAgentRowToChatMessages(row))
        );
      });
  }, [id]);

  // Cards read this, because a short-lived component using the hook above would
  // detach the running reply when it unmounts.
  useEffect(() => {
    setRunning(isLoading);
  }, [isLoading, setRunning]);

  // A list written before the agent connects is emptied by the connect, and the
  // connect can also empty the chat after the list is shown.
  useEffect(() => {
    if (!isAvailable || !stored) {
      return;
    }

    if (!written.current) {
      written.current = true;
      restore.current = stored;
      setMessages(stored);
      return;
    }

    if (messages.length) {
      restore.current = messages;
      return;
    }

    if (restore.current.length) {
      setMessages(restore.current.map(withoutCards));
    }
  }, [isAvailable, stored, messages]);

  return null;
};

// An item of a sent message, opening in the Media library's viewer, which plays
// a video itself. `.copilotKitMessage img` outranks plain utilities, so a square
// has to be important about its size.
const SentMedia: FC<{
  item: AgentMessageMedia;
  position: number;
  alone: boolean;
}> = ({ item, position, alone }) => {
  const t = useT();
  const modals = useModals();
  const [failed, setFailed] = useState(false);
  const isVideo = item.kind === 'video';

  if (failed) {
    return (
      <div className="flex items-center justify-center w-[120px] h-[120px] phone:w-[96px] phone:h-[96px] p-[8px] rounded-[12px] bg-surface text-muted text-[12px] text-center">
        {isVideo
          ? t('samy_video_unavailable', 'This video is no longer available')
          : t('samy_image_unavailable', 'This image is no longer available')}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => modals.openModal(chatMediaPreview(item.url))}
      aria-label={
        isVideo
          ? t('samy_attached_video', 'Attached video {{n}}', { n: position })
          : t('samy_attached_image', 'Attached image {{n}}', { n: position })
      }
      className="block rounded-[12px] cursor-zoom-in focus-visible:ring-2 focus-visible:ring-brand"
    >
      {isVideo ? (
        <span className="block relative w-[120px] h-[120px] phone:w-[96px] phone:h-[96px] rounded-[12px] overflow-hidden">
          <VideoFrame
            url={item.url}
            className="block w-full h-full object-cover"
            onError={() => setFailed(true)}
          />
          <PlayBadge />
        </span>
      ) : (
        <img
          src={item.url}
          alt=""
          // Chrome reports a picture dragged inside the page as a file, which
          // would come back through the drop zone as a new upload.
          draggable={false}
          onError={() => setFailed(true)}
          // A lone picture has no reserved size, so a reopened chat grows as it loads.
          // Squares hold theirs from the start.
          onLoad={alone ? keepChatAtBottom : undefined}
          className={clsx(
            'block rounded-[12px]',
            alone
              ? 'max-w-[200px] max-h-[200px] phone:max-w-[160px] phone:max-h-[160px]'
              : '!w-[120px] !h-[120px] phone:!w-[96px] phone:!h-[96px] object-cover'
          )}
        />
      )}
    </button>
  );
};

const Message: FC<UserMessageProps> = (props) => {
  const { text, media } = useMemo(
    () =>
      extractAgentMessageMedia(
        stripIntegrationsBlock(
          props.message ? extractAgentMessageText(props.message) : ''
        )
      ),
    [props.message]
  );

  return (
    <div
      dir="auto"
      className={clsx(
        'copilotKitMessage copilotKitUserMessage min-w-[300px]',
        // CopilotKit's stylesheet loads after ours, so its padding outranks these
        // unless they're important.
        !!media.length && '!pt-[10px] !px-[10px] !pb-[8px]'
      )}
    >
      {media.length ? (
        <>
          <div className="flex flex-wrap gap-[6px]">
            {media.map((item, index) => (
              <SentMedia
                key={`${index}-${item.url}`}
                item={item}
                position={index + 1}
                alone={media.length === 1}
              />
            ))}
          </div>
          {!!text && <div className="pt-[8px] px-[4px]">{text}</div>}
        </>
      ) : (
        text
      )}
    </div>
  );
};

// CopilotKit's own reply bubble, wrapped rather than replaced: the markdown, the
// copy and retry controls and the loading state are all its business and none of
// them change — only the direction the reply is read in, which the slot cannot
// set on a bubble it does not render. What Samy made goes above the bubble, in the
// interface's direction, whatever language the words are in. The bubble gets none
// of it, or it would draw it again.
const Reply: FC<AssistantMessageProps> = ({ subComponent, ...props }) => {
  const { running } = useChatRun();

  return (
    <>
      <CardMayWaitContext.Provider
        value={running && isInLatestExchange(props.messages, props.message?.id)}
      >
        <div
          dir={i18next.dir()}
          className="[container-type:inline-size] flex flex-wrap gap-[8px] my-[8px] empty:hidden"
        >
          {subComponent}
        </div>
      </CardMayWaitContext.Provider>
      <div dir="auto">
        <AssistantMessage
          {...props}
          message={props.message && withoutCards(props.message)}
        />
      </div>
    </>
  );
};
const NewInput: FC<InputProps> = (props) => {
  const { attached, uploading, addFiles, clear } = useAttachments();
  const [value, setValue] = useState('');
  return (
    <>
      <Input
        {...props}
        onChange={setValue}
        attachments={<AttachmentsTray />}
        tools={<AttachmentTools value={value} />}
        uploading={uploading}
        onPasteFiles={addFiles}
        onSend={(text) => {
          const send = props.onSend(
            text +
              (attached.length > 0
                ? '\n[--Media--]' +
                  attached
                    .map((m) =>
                      hasExtension(m.path, 'mp4')
                        ? `Video: ${m.path}`
                        : `Image: ${m.path}`
                    )
                    .join('\n') +
                  '\n[--Media--]'
                : '')
          );
          setValue('');
          clear();
          return send;
        }}
      />
    </>
  );
};

export const Hooks: FC = () => {
  const modals = useModals();

  useCopilotAction({
    name: 'manualPosting',
    description:
      'Opens the post editor pre-filled with these posts, for the user to review and save themselves; nothing is saved until they do. Use it only when the user asks to open the posts in the editor to review or edit them, never to save drafts or to add posts to the calendar: integrationSchedulePostTool does that, with type "draft" for drafts.',
    parameters: [
      {
        name: 'list',
        type: 'object[]',
        description:
          'list of posts to schedule, one entry per post. A post going to several channels is a single entry naming all of them, not one entry per channel',
        attributes: [
          {
            name: 'integrationIds',
            type: 'string[]',
            description:
              'ids of every channel this post goes to. Group all channels sharing the same content and date into this one entry; add another entry only for a post with different content or a different date',
          },
          {
            name: 'date',
            type: 'string',
            description: 'UTC date of the scheduled post',
          },
          {
            name: 'posts',
            type: 'object[]',
            description: 'list of posts / comments (one under another)',
            attributes: [
              {
                name: 'content',
                type: 'string',
                description: 'the content of the post',
              },
              {
                name: 'attachments',
                type: 'object[]',
                description: 'list of attachments',
                attributes: [
                  {
                    name: 'id',
                    type: 'string',
                    description: 'id of the attachment',
                  },
                  {
                    name: 'path',
                    type: 'string',
                    description: 'url of the attachment',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (status === 'executing') {
        return <OpenModal args={args} respond={respond} />;
      }

      return null;
    },
  });

  useCopilotAction(createdImageAction);

  return null;
};

export const OpenModal: FC<{
  respond: (value: any) => void;
  args: {
    list: {
      integrationIds: string[];
      date: string;
      posts: { content: string; attachments: { id: string; path: string }[] }[];
    }[];
  };
}> = ({ args, respond }) => {
  const modals = useModals();
  const fetch = useFetch();
  const t = useT();

  const load = useCallback(async () => {
    return (await (await fetch('/integrations/list')).json()).integrations;
  }, [fetch]);

  const { data: allIntegrations } = useSWR<Integrations[]>(
    'integrations',
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      revalidateOnMount: true,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      fallbackData: [],
    }
  );

  const startModal = useCallback(async () => {
    let saved = 0;

    for (const entry of args.list) {
      // One editor per post, opened in sequence. This id is the React key in
      // the modal manager, so it must differ per post: a shared id reconciles
      // the next editor onto the previous one, which then keeps its state (a
      // stuck spinner) and skips its mount effects.
      const id = `add-edit-modal-${makeId(10)}`;

      // Resolves on every way out of the editor, not just on a save: `mutate`
      // when the post is saved, `customClose` when the editor's own close
      // button is used, `onClose` when the modal manager closes it (Escape).
      // Waiting on `mutate` alone left the loop — and the copilot action with
      // it — hanging forever on an editor the user closed.
      const wasSaved = await new Promise<boolean>((res) => {
        modals.openModal({
          id,
          onClose: () => res(false),
          closeOnClickOutside: false,
          removeLayout: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          fullScreen: true,
          title: ``,
          // Deliberately no ExistingDataContextProvider: these are new posts,
          // and that context puts AddEditModal into edit-an-existing-post mode.
          // It takes a single integration, which is what forced one editor per
          // channel, and it makes the save report itself as an update of a
          // group the database has never seen. selectedChannels pre-ticks every
          // channel through the same path the picker uses, so the editor is the
          // one the calendar opens and the channels stay editable.
          children: (
            <AddEditModal
              date={fromUtc(entry.date)}
              allIntegrations={allIntegrations}
              integrations={allIntegrations}
              selectedChannels={entry.integrationIds}
              onlyValues={entry.posts.map((p) => ({
                content: p.content,
                id: makeId(10),
                image: p.attachments.map((a) => ({
                  id: a.id,
                  path: a.path,
                })),
              }))}
              reopenModal={() => {}}
              // Closes this editor by id rather than every open modal: the
              // editor also runs customClose two seconds after a successful
              // save (manage.modal.tsx), by which time the next post's editor
              // is the one on screen.
              customClose={() => {
                modals.closeById(id);
                res(false);
              }}
              mutate={() => res(true)}
            />
          ),
        });
      });

      if (wasSaved) {
        saved++;
      }
    }

    // The tool result is what the agent narrates from, and it is resent with
    // every later turn, so keep it short. 'User scheduled all the posts' read
    // as the tool having scheduled them itself, which is what it then claimed —
    // and it was unconditional, so it claimed that for posts the user had
    // closed without saving too.
    const total = args.list.length;
    respond(
      saved === 0
        ? `Opened the editor; the user closed it without saving any of the ${total} post(s) — nothing was scheduled. Don't reopen the editor unless they ask.`
        : saved === total
        ? `Opened the editor; the user reviewed and saved all ${total} post(s) themselves — this tool scheduled nothing. They may have edited the content, channels or date, so don't restate the details as final.`
        : `Opened the editor; the user reviewed and saved ${saved} of ${total} post(s) themselves and closed the rest without saving — nothing was scheduled for those, and this tool scheduled nothing itself. They may have edited the content, channels or date, so don't restate the details as final. Don't reopen the editor unless they ask.`
    );
  }, [args, respond, allIntegrations]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !allIntegrations.length) {
      return;
    }
    started.current = true;
    startModal();
  }, [allIntegrations, startModal]);

  // No click-to-respond escape hatch here: it was the only way out while a
  // closed editor could hang the loop, and now that every editor resolves, a
  // stray click on this line would end the action with editors still queued.
  return <div>{t('opening_post_editor', 'Opening the post editor…')}</div>;
};
