'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useClickAway } from '@uidotdev/usehooks';
import ReactLoading from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
// notifications are plain text, the urls in them become links
function replaceLinks(text: string) {
  const urlRegex =
    /(\bhttps?:\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/gi;
  return text.split(urlRegex).map((part, index) => {
    if (index % 2 === 0) {
      return part;
    }
    return (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer underline font-bold"
      >
        {part}
      </a>
    );
  });
}
export const ShowNotification: FC<{
  notification: {
    createdAt: string;
    content: string;
  };
  newNotification: boolean;
}> = (props) => {
  const { notification, newNotification } = props;
  const createdAt = newDayjs(notification.createdAt);
  const isWithin24h = newDayjs().diff(createdAt, 'hour') < 24;
  const fullDate = createdAt.format('MMM D, YYYY h:mm A');
  return (
    <div
      className={clsx(
        `text-textColor px-[16px] py-[10px] border-b border-tableBorder last:border-b-0 transition-colors`,
        newNotification &&
          'font-bold bg-brandSoft border-s-2 border-s-brand animate-newMessages'
      )}
    >
      <div className="break-words">{replaceLinks(notification.content)}</div>
      <div
        className="text-[11px] mt-[4px] opacity-60 font-normal"
        title={isWithin24h ? fullDate : undefined}
      >
        {isWithin24h ? createdAt.fromNow() : fullDate}
      </div>
    </div>
  );
};
// every call marks the notifications as read, so it only runs when the popup opens
const useNotificationsList = () => {
  const fetch = useFetch();
  return useSWR(
    'notifications',
    async () => {
      return await (await fetch('/notifications/list')).json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 0,
    }
  );
};
export const NotificationOpenComponent = () => {
  const t = useT();
  const { data, isLoading, isValidating } = useNotificationsList();
  const notifications: { createdAt: string; content: string }[] =
    data?.notifications || [];
  // reopening shows the cached list first, only the fresh one knows what is new
  const isNew = (createdAt: string) =>
    !isValidating &&
    new Date(createdAt) > new Date(data?.lastReadNotifications);
  return (
    <div
      id="notification-popup"
      className="opacity-0 animate-normalFadeDown mt-[10px] absolute w-[420px] phone:w-[min(420px,calc(100vw-24px))] min-h-[200px] top-[100%] end-0 bg-third text-textColor rounded-[16px] flex flex-col border border-tableBorder shadow-card z-[600]"
    >
      <div
        className={`p-[16px] border-b border-tableBorder font-bold bg-newBgColor rounded-t-[16px]`}
      >
        {t('notifications', 'Notifications')}
      </div>

      <div className="flex flex-col max-h-[400px] overflow-y-auto scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor">
        {isLoading && (
          <div className="flex-1 flex justify-center pt-12">
            <ReactLoading type="spin" color="var(--ink)" width={36} height={36} />
          </div>
        )}
        {!isLoading && !notifications.length && (
          <div className="text-center p-[16px] text-textColor flex-1 flex justify-center items-center mt-[20px]">
            {t('no_notifications', 'No notifications')}
          </div>
        )}
        {!isLoading &&
          notifications.map((notification, index) => (
            <ShowNotification
              notification={notification}
              newNotification={isNew(notification.createdAt)}
              key={`notifications_${index}`}
            />
          ))}
      </div>
    </div>
  );
};
const NotificationComponent = () => {
  const fetch = useFetch();
  const [show, setShow] = useState(false);
  const loadNotifications = useCallback(async () => {
    return await (await fetch('/notifications')).json();
  }, []);
  const { data, mutate } = useSWR('notifications-list', loadNotifications);
  const changeShow = useCallback(() => {
    mutate(
      {
        ...data,
        total: 0,
      },
      {
        revalidate: false,
      }
    );
    setShow(!show);
  }, [show, data]);
  const ref = useClickAway<HTMLDivElement>(() => setShow(false));
  return (
    <div
      className="relative cursor-pointer select-none coarse:min-w-[44px] coarse:min-h-[44px] coarse:flex coarse:items-center coarse:justify-center"
      ref={ref}
    >
      <div onClick={changeShow}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="hover:text-newTextColor"
        >
          <path
            d="M14 21H10M18 8C18 6.4087 17.3679 4.88258 16.2427 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.8826 2.63214 7.75738 3.75736C6.63216 4.88258 6.00002 6.4087 6.00002 8C6.00002 11.0902 5.22049 13.206 4.34968 14.6054C3.61515 15.7859 3.24788 16.3761 3.26134 16.5408C3.27626 16.7231 3.31488 16.7926 3.46179 16.9016C3.59448 17 4.19261 17 5.38887 17H18.6112C19.8074 17 20.4056 17 20.5382 16.9016C20.6852 16.7926 20.7238 16.7231 20.7387 16.5408C20.7522 16.3761 20.3849 15.7859 19.6504 14.6054C18.7795 13.206 18 11.0902 18 8Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {data && data.total > 0 && (
            <circle
              cx="17.0625"
              cy="5"
              r="4"
              fill="var(--brand)"
              stroke="var(--bg)"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
      {show && <NotificationOpenComponent />}
    </div>
  );
};
export default NotificationComponent;
