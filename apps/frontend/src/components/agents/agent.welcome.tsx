'use client';

import React, { FC } from 'react';
import clsx from 'clsx';
import i18next from 'i18next';
import { RenderSuggestionsListProps } from '@copilotkit/react-ui';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useAttachments,
  useSendWithAttachments,
} from '@gitroom/frontend/components/agents/agent.attachments';
import { useChatRun } from '@gitroom/frontend/components/agents/agent.created.media';
import { FOCUS_RING } from '@gitroom/frontend/components/launches/channel.panel';
import {
  BulbIcon,
  CalendarIcon,
  InsertMediaIcon,
  SamyIcon,
  TagIcon,
} from '@gitroom/frontend/components/ui/icons';

/**
 * Samy's four ideas to start a chat from, for CopilotChat's static
 * `suggestions`. Each sends its own words, so it reads in the chat exactly as
 * if it had been typed.
 */
export const samyIdeas = (
  t: (key: string, fallback: string) => string
): { title: string; message: string }[] =>
  [
    t('samy_idea_plan_week', "Plan next week's posts"),
    t('samy_idea_offer_post', 'Write a post about an offer'),
    t('samy_idea_instagram_image', 'Make an image for Instagram'),
    t('samy_idea_month_ideas', 'Give me post ideas for this month'),
  ].map((idea) => ({ title: idea, message: idea }));

// By position, as samyIdeas lists them. CalendarIcon and TagIcon draw at a fixed
// size and ignore `size`.
const IDEA_ICONS = [
  <CalendarIcon
    key="calendar"
    width={20}
    height={20}
    aria-hidden="true"
    className="text-brand"
  />,
  <TagIcon
    key="tag"
    width={20}
    height={20}
    aria-hidden="true"
    className="text-brand"
  />,
  <InsertMediaIcon
    key="media"
    size={20}
    aria-hidden="true"
    className="text-brand"
  />,
  <BulbIcon key="bulb" size={20} aria-hidden="true" className="text-brand" />,
];

/**
 * The welcome on a chat with no messages, drawn where CopilotKit draws its
 * suggestions: the footer under the messages. An idea is sent through the same
 * path typed text takes, so it carries what's attached and empties the tray.
 */
export const SamyWelcome: FC<RenderSuggestionsListProps> = ({
  suggestions,
  onSuggestionClick,
}) => {
  const t = useT();
  const { empty } = useChatRun();
  const { uploading } = useAttachments();
  const send = useSendWithAttachments(onSuggestionClick);

  if (!empty) {
    return null;
  }

  return (
    <div
      data-samy-welcome=""
      dir={i18next.dir()}
      className="flex flex-col items-center gap-[14px] px-[24px] py-[24px] text-center"
    >
      <div className="w-[48px] h-[48px] rounded-[14px] bg-brandSoft2 text-brand flex items-center justify-center">
        <SamyIcon size={26} aria-hidden="true" />
      </div>
      <h2 className="text-[24px] font-[600] text-ink">
        {t('samy_welcome_title', "Hi, I'm Samy 👋")}
      </h2>
      <p className="text-[15px] leading-[1.6] text-inkSoft max-w-[430px]">
        {t(
          'samy_welcome_line',
          "Tell me what you want to post. I'll write it, make the pictures and schedule it on your channels."
        )}
      </p>
      <ul
        aria-label={t('samy_welcome_ideas', 'Ideas to start')}
        className="grid grid-cols-2 phone:grid-cols-1 gap-[10px] w-full max-w-[560px] mt-[10px]"
      >
        {suggestions.map((suggestion, index) => (
          <li key={suggestion.message}>
            <button
              type="button"
              disabled={uploading}
              onClick={() => send(suggestion.message)}
              className={clsx(
                'flex items-center gap-[10px] w-full h-full min-h-[52px] px-[14px] py-[10px] rounded-[12px] border border-line bg-surface text-[14px] font-[500] text-ink text-start cursor-pointer hover:border-inkSoft transition-colors disabled:opacity-50 disabled:pointer-events-none',
                FOCUS_RING
              )}
            >
              {IDEA_ICONS[index]}
              {suggestion.title}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted mt-[6px]">
        {t(
          'samy_welcome_hint',
          "Tick channels in the Channels panel and I'll post to those."
        )}
      </p>
    </div>
  );
};
