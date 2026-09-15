'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import DeleteAccountComponent from '@gitroom/frontend/components/settings/delete-account.component';
const useFaqList = () => {
  const user = useUser();
  const t = useT();
  return [
    ...(user?.allowTrial
      ? [
          {
            title: t(
              'faq_am_i_going_to_be_charged_by_postiz',
              'Am I going to be charged by Sharek?'
            ),
            description: t(
              'faq_to_confirm_credit_card_information_postiz_will_hold',
              'To confirm credit card information Sharek will hold $2 and release it immediately, you can cancel your subscription anytime from settings without talking to a person'
            ),
          },
        ]
      : []),
    {
      title: t('faq_who_is_samy', 'Who is Samy?'),
      description: t(
        'faq_who_is_samy_answer',
        'Samy is your built-in AI agent. Chat to brainstorm ideas, write and refine captions, generate images and video, and schedule to every channel, so a week of content comes together in one sitting.'
      ),
    },
    {
      title: t('faq_images_and_video', 'Can Sharek create images and video for me?'),
      description: t(
        'faq_images_and_video_answer',
        'Yes. Describe what you want and Sharek creates ready-to-post images, or short videos for Reels, Stories and the feed. A built-in editor lets you refine every visual before it goes out.'
      ),
    },
    {
      title: t('faq_which_channels', 'Which channels can I publish to?'),
      description: t(
        'faq_which_channels_answer',
        'A channel is one connected account you publish to — your Instagram profile, your X account, your LinkedIn page. Sharek supports 30+ of them, including Instagram, X, Facebook, LinkedIn, TikTok, YouTube, Threads, Pinterest, Reddit, Telegram, Discord and Bluesky. Your plan sets how many you can connect at once.'
      ),
    },
    {
      title: t('faq_team_and_clients', 'Can my team and clients work together in Sharek?'),
      description: t(
        'faq_team_and_clients_answer',
        'Yes. Invite your team to draft, review and schedule together, group channels by client or brand, and send clients a preview link so they can approve before anything goes live. Your plan sets how many team members you can invite.'
      ),
    },
    ...(user?.tier?.current === 'FREE'
      ? [
          {
            title: t(
              'faq_how_can_i_delete_my_account',
              'How can I delete my account?'
            ),
            description: t(
              'faq_delete_account_description',
              "If you don't want to continue using Sharek, you can delete your account, including all your organizations, channels and posts. This action cannot be undone."
            ),
            content: <DeleteAccountComponent isLink={true} />,
          },
        ]
      : []),
  ];
};
export const FAQSection: FC<{
  title: string;
  description: string;
  content?: ReactNode;
}> = (props) => {
  const { title, description, content } = props;
  const [show, setShow] = useState(false);
  const changeShow = useCallback(() => {
    setShow(!show);
  }, [show]);
  return (
    <div
      className="bg-sixth p-[24px] border border-tableBorder rounded-[8px] flex flex-col"
      onClick={changeShow}
    >
      <div className={`text-[20px] cursor-pointer flex justify-center coarse:items-center coarse:min-h-[44px]`}>
        <div className="flex-1">{title}</div>
        <div className="flex items-center justify-center w-[32px]">
          {!show ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M18 12.75H6C5.59 12.75 5.25 12.41 5.25 12C5.25 11.59 5.59 11.25 6 11.25H18C18.41 11.25 18.75 11.59 18.75 12C18.75 12.41 18.41 12.75 18 12.75Z"
                fill="var(--muted)"
              />
              <path
                d="M12 18.75C11.59 18.75 11.25 18.41 11.25 18V6C11.25 5.59 11.59 5.25 12 5.25C12.41 5.25 12.75 5.59 12.75 6V18C12.75 18.41 12.41 18.75 12 18.75Z"
                fill="var(--muted)"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M24 17H8C7.45333 17 7 16.5467 7 16C7 15.4533 7.45333 15 8 15H24C24.5467 15 25 15.4533 25 16C25 16.5467 24.5467 17 24 17Z"
                fill="var(--muted)"
              />
            </svg>
          )}
        </div>
      </div>
      <div
        className={clsx(
          'transition-all duration-500 overflow-hidden',
          !show ? 'max-h-[0]' : 'max-h-[500px]'
        )}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={`mt-[16px] w-full text-wrap font-[400] text-[16px] text-ink select-text max-w-[450px]`}
          dangerouslySetInnerHTML={{
            __html: description,
          }}
        />
        {content && (
          <div
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="mt-[16px]"
          >
            {content}
          </div>
        )}
      </div>
    </div>
  );
};
export const FAQComponent: FC = () => {
  const t = useT();
  const list = useFaqList();
  return (
    <div>
      <h3 className="text-[24px] mt-[48px] mb-[40px] mobile:mt-[80px]">
        {t('frequently_asked_questions', 'Frequently Asked Questions')}
      </h3>
      <div className="gap-[24px] flex-col flex select-none mb-[40px]">
        {list.map((item, index) => (
          <FAQSection key={index} {...item} />
        ))}
      </div>
    </div>
  );
};
