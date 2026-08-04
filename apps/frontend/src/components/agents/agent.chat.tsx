'use client';

import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import { CopilotChat, CopilotKitCSSProperties } from '@copilotkit/react-ui';
import {
  InputProps,
  UserMessageProps,
} from '@copilotkit/react-ui/dist/components/chat/props';
import { Input } from '@gitroom/frontend/components/agents/agent.input';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import {
  CopilotKit,
  useCopilotAction,
  useCopilotMessagesContext,
} from '@copilotkit/react-core';
import {
  MediaPortal,
  PropertiesContext,
} from '@gitroom/frontend/components/agents/agent';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  extractAgentMessageText,
  stripIntegrationsBlock,
} from '@gitroom/helpers/utils/extract.agent.message.text';
import { TextMessage } from '@copilotkit/runtime-client-gql';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import i18next from 'i18next';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
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
      <LoadMessages id={params.id} />
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
          <CopilotChat
            className="w-full h-full"
            labels={{
              title: t('samy', 'Samy'),
              initial: t(
                'samy_welcome_message',
                "Hi, I'm Samy 👋 — your Sharek assistant. I can plan and schedule one post or many across all your connected channels, and generate images and videos for them. Pick the channels you want from the channels panel, and find our previous conversations in the history panel. You can also use me as an MCP server — see Settings → Public API."
              ),
            }}
            UserMessage={Message}
            Input={NewInput}
          />
        </div>
      </div>
    </CopilotKit>
  );
};

const LoadMessages: FC<{ id: string }> = ({ id }) => {
  const { setMessages } = useCopilotMessagesContext();
  const fetch = useFetch();

  const loadMessages = useCallback(async (idToSet: string) => {
    const data = await (await fetch(`/copilot/${idToSet}/list`)).json();
    console.log(data);
    setMessages(
      data.messages.flatMap((p: any) => {
        // Threads written before the channel list moved into the system prompt
        // carry it in the message text. Drop it here so reopening an old thread
        // does not resend it to the model on every turn.
        const content = stripIntegrationsBlock(extractAgentMessageText(p));
        return content ? [new TextMessage({ content, role: p.role })] : [];
      })
    );
  }, []);

  useEffect(() => {
    if (id === 'new') {
      setMessages([]);
      return;
    }
    loadMessages(id);
  }, [id]);

  return null;
};

const Message: FC<UserMessageProps> = (props) => {
  const convertContentToImagesAndVideo = useMemo(() => {
    return stripIntegrationsBlock(props.message?.content || '')
      .replace(/Video: (http.*mp4\n)/g, (match, p1) => {
        return `<video controls class="h-[150px] w-[150px] rounded-[8px] mb-[10px]"><source src="${p1.trim()}" type="video/mp4">Your browser does not support the video tag.</video>`;
      })
      .replace(/Image: (http.*\n)/g, (match, p1) => {
        return `<img src="${p1.trim()}" class="h-[150px] w-[150px] max-w-full border border-newBgColorInner" />`;
      })
      .replace(/\[\-\-Media\-\-\](.*)\[\-\-Media\-\-\]/g, (match, p1) => {
        return `<div class="flex justify-center mt-[20px]">${p1}</div>`;
      });
  }, [props.message?.content]);
  return (
    <div
      className="copilotKitMessage copilotKitUserMessage min-w-[300px]"
      dangerouslySetInnerHTML={{ __html: convertContentToImagesAndVideo }}
    />
  );
};
const NewInput: FC<InputProps> = (props) => {
  const [media, setMedia] = useState([] as { path: string; id: string }[]);
  const [value, setValue] = useState('');
  return (
    <>
      <Input
        {...props}
        onChange={setValue}
        tools={
          <MediaPortal
            value={value}
            media={media}
            setMedia={(e) => setMedia(e.target.value)}
          />
        }
        onSend={(text) => {
          const send = props.onSend(
            text +
              (media.length > 0
                ? '\n[--Media--]' +
                  media
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
          setMedia([]);
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
      'This tool should be triggered when the user wants to manually add the generated post',
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
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          // Deliberately no ExistingDataContextProvider: these are new posts,
          // and that context puts AddEditModal into edit-an-existing-post mode.
          // It takes a single integration, which is what forced one editor per
          // channel, and it makes the save report itself as an update of a
          // group the database has never seen. selectedChannels pre-ticks every
          // channel through the same path the picker uses, so the editor is the
          // one the calendar opens and the channels stay editable.
          children: (
            <AddEditModal
              date={dayjs.utc(entry.date)}
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
