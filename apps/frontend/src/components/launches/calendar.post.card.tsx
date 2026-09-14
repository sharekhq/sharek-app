'use client';

import { CSSProperties, forwardRef, ReactNode } from 'react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import { Integration, Post, State, Tags } from '@prisma/client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { isUSCitizen } from './helpers/isuscitizen.utils';

export type CalendarPost = Post & {
  integration: Integration;
  tags: {
    tag: Tags;
  }[];
};

// The card a post is drawn as, wherever it is drawn. The calendar renders it in
// a day cell with its actions attached; the drag layer renders the same card
// under the pointer, because the browser's own drag preview fills in the
// corners the radius cuts away (calendar.drag.layer.tsx). Sharing the component
// rather than the look is the point: a preview that is only nearly the card is
// a preview of something you did not pick up.
export const CalendarPostCard = forwardRef<
  HTMLDivElement,
  {
    post: CalendarPost;
    state: State;
    isBeforeNow: boolean;
    showTime?: boolean;
    // The card in the grid carries its actions menu; the one under the pointer
    // carries no controls, since nothing on it can be pressed mid-drag.
    actions?: ReactNode;
    onClick?: () => void;
    // Held above the grid rather than sitting in it. One shadow token or the
    // other — never both, since they are the same property.
    lifted?: boolean;
    style?: CSSProperties;
  }
>((props, ref) => {
  const { post, state, isBeforeNow, showTime, actions, onClick, lifted, style } =
    props;
  const t = useT();
  const user = useUser();
  const showCreationMethodBadge =
    user?.impersonate &&
    post.creationMethod &&
    post.creationMethod !== 'UNKNOWN';

  return (
    <div
      ref={ref}
      className={clsx(
        'w-full flex h-full flex-1 flex-col group',
        'relative rounded-[10px] border border-line',
        lifted ? 'shadow-card scale-[1.04]' : 'shadow-soft',
        state === 'ERROR' && 'ring-2 ring-error'
      )}
      style={style}
    >
      {state === 'ERROR' && (
        <div
          className="absolute -top-[6px] -left-[6px] z-20 w-[18px] h-[18px] rounded-full bg-error flex items-center justify-center text-white text-[11px] font-bold cursor-pointer"
          data-tooltip-id="tooltip"
          data-tooltip-content={post.error || 'An error occurred while publishing this post'}
        >
          !
        </div>
      )}
      {showCreationMethodBadge && (
        <div className="absolute -bottom-[4px] -right-[4px] z-10">
          <CreationMethodBadge
            creationMethod={post.creationMethod}
            ringColor="var(--new-bgColor)"
          />
        </div>
      )}
      <div
        className={clsx(
          post?.tags?.[0]?.tag?.color ? 'text-white' : 'text-inkSoft',
          'relative text-[11px] max-h-[24px] h-[24px] min-h-[24px] coarse:max-h-[44px] coarse:h-[44px] coarse:min-h-[44px] w-full rounded-tr-[10px] rounded-tl-[10px] flex items-center justify-center gap-[10px] px-[5px] bg-surface2'
        )}
        style={{
          backgroundColor: post?.tags?.[0]?.tag?.color,
        }}
      >
        {state === 'ERROR' ? (
          <span className="cal-chip cal-chip-error">
            ! {t('calendar_state_failed', 'Failed')}
          </span>
        ) : state === 'DRAFT' ? (
          <span className="cal-chip cal-chip-draft">{t('draft', 'Draft')}</span>
        ) : state === 'PUBLISHED' ||
          dayjs().isAfter(dayjs.utc(post.publishDate)) ? (
          <span className="cal-chip cal-chip-success">
            ✓ {t('calendar_state_published', 'Published')}
          </span>
        ) : (
          <span className="cal-chip cal-chip-info">
            {t('calendar_state_scheduled', 'Scheduled')}
          </span>
        )}
        <div
          className={clsx(
            post?.tags?.[0]?.tag?.color ? 'mix-blend-difference' : '',
            'group-hover:hidden coarse:hidden cursor-pointer'
          )}
        >
          {post.tags.map((p) => p.tag.name).join(', ')}
        </div>
        {actions}
      </div>
      <div
        onClick={onClick}
        className={clsx(
          'gap-[5px] w-full flex h-full flex-1 rounded-br-[10px] rounded-bl-[10px] p-[8px] text-[14px] bg-surface',
          'relative',
          isBeforeNow && '!grayscale'
        )}
      >
        <div className={clsx('relative min-w-[20px]')}>
          <img
            className="w-[20px] h-[20px] rounded-[8px]"
            src={post.integration.picture! || '/no-picture.jpg'}
          />
          <img
            className="w-[12px] h-[12px] rounded-[8px] absolute z-10 top-[10px] end-0 border border-fifth"
            src={`/icons/platforms/${post.integration?.providerIdentifier}.png`}
          />
        </div>
        <div className="w-full flex-1 flex flex-col min-h-[40px]">
          <div className="text-start"></div>
            <div className="w-full relative">
              <div className="absolute top-0 start-0 w-full text-ellipsis break-words line-clamp-1 text-start">
                {stripHtmlValidation('none', post.content, false, true, false) ||
                  t('no_content', 'no content')}
              </div>
            </div>
        </div>
        {showTime && (
          <div className="text-muted text-[12px] whitespace-nowrap flex items-center">
            {newDayjs(post.publishDate).local().format(isUSCitizen() ? 'hh:mm A' : 'HH:mm')}
          </div>
        )}
      </div>
    </div>
  );
});
