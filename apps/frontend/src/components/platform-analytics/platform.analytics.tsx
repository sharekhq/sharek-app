'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { RenderAnalytics } from '@gitroom/frontend/components/platform-analytics/render.analytics';
import { EmptyState } from '@gitroom/frontend/components/ui/empty.state';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import useCookie from 'react-use-cookie';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { platformLabel } from '@gitroom/frontend/components/launches/helpers/platform-label';
import {
  ChannelPanel,
  FOCUS_RING,
  isUsable,
  orderChannels,
} from '@gitroom/frontend/components/launches/channel.panel';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { SplitPanel } from '@gitroom/frontend/components/ui/split.panel';
const allowedIntegrations = [
  'facebook',
  'instagram',
  'instagram-standalone',
  'linkedin-page',
  'tiktok',
  'tiktok-business',
  'youtube',
  'gmb',
  'pinterest',
  'threads',
  'x',
];
const AnalyticsEmptyIllustration = () => (
  <svg
    width="132"
    height="108"
    viewBox="0 0 132 108"
    fill="none"
    className="text-muted"
    role="presentation"
  >
    <line
      x1="22"
      y1="88"
      x2="118"
      y2="88"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.45"
    />
    <rect x="30" y="64" width="14" height="24" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.55" />
    <rect x="54" y="52" width="14" height="36" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.55" />
    <rect x="78" y="40" width="14" height="48" rx="3" stroke="currentColor" strokeWidth="2" opacity="0.55" />
    <rect x="102" y="28" width="14" height="60" rx="3" className="text-brand" fill="currentColor" />
  </svg>
);
// The chosen channel: its picture with the platform's badge, its name in its
// own direction, and "Platform · Customer". 40px in the top bar, and 28px in
// the channel button that takes its place at 1025px and below.
const ChosenChannel: FC<{
  channel: {
    name: string;
    identifier: string;
    picture?: string | null;
    customer?: { name?: string } | null;
  };
  phone?: boolean;
}> = ({ channel, phone = false }) => (
  <>
    <span className="relative flex flex-none">
      <ImageWithFallback
        fallbackSrc={`/icons/platforms/${channel.identifier}.png`}
        src={channel.picture}
        className="rounded-[8px]"
        alt=""
        width={phone ? 28 : 40}
        height={phone ? 28 : 40}
      />
      <SafeImage
        src={`/icons/platforms/${channel.identifier}.png`}
        className="rounded-[8px] absolute z-10 bottom-[5px] -end-[5px] border border-fifth"
        alt=""
        width={phone ? 13 : 16}
        height={phone ? 13 : 16}
      />
    </span>
    <span className="flex-1 min-w-0 flex flex-col text-start">
      <bdi
        className={clsx(
          'font-[600] text-ink truncate',
          phone ? 'text-[15px]' : 'text-[18px]'
        )}
      >
        {channel.name}
      </bdi>
      <span
        className={clsx(
          'text-muted truncate',
          phone ? 'text-[12px]' : 'text-[13px]'
        )}
      >
        {[platformLabel(channel.identifier), channel.customer?.name]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </span>
  </>
);
/**
 * Analytics (contracts/pages-ui.md): the numbers, then the shared channel list
 * in analytics mode at the end. At 1025px and below the list opens as
 * SplitPanel's sheet, from the channel button in the top bar.
 */
export const PlatformAnalytics = () => {
  const t = useT();
  const router = useRouter();
  const { disableXAnalytics } = useVariables();

  const supportedPlatforms = Array.from(
    new Set(allowedIntegrations.map((p) => platformLabel(p)))
  ).join(', ');

  const [chosen, setChosen] = useState<string | null>(null);
  const [key, setKey] = useState(7);
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const [channelsOpen, setChannelsOpen] = useState(false);
  const railCollapsed = collapseMenu === '1' && !channelsOpen;
  const { data, isLoading, mutate } = useIntegrationList();
  // Whether a channel's platform has numbers: upstream's list, without X while
  // its analytics are off (C7).
  const hasStatistics = useCallback(
    ({ identifier }: { identifier: string }) =>
      allowedIntegrations.includes(identifier) &&
      !(identifier === 'x' && disableXAnalytics),
    [disableXAnalytics]
  );
  // The chosen channel while it can be picked, otherwise the first that can in
  // the list's order, so a change in the list never moves the choice (R21,
  // C20).
  const currentIntegration = useMemo(() => {
    const picked = data.find(({ id }: { id: string }) => id === chosen);
    return picked && isUsable(picked, 'analytics', hasStatistics)
      ? picked
      : orderChannels(data)
          .flatMap(({ channels }) => channels)
          .find((channel) => isUsable(channel, 'analytics', hasStatistics));
  }, [data, chosen, hasStatistics]);
  // t is a dependency because the range labels are translated: a language switch
  // re-creates it, and never changes the integration this is otherwise keyed on.
  const options = useMemo(() => {
    if (!currentIntegration) {
      return [];
    }
    const arr = [];
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
        'tiktok-business',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 7,
        value: t('last_7_days', 'Last 7 days'),
      });
    }
    if (
      [
        'facebook',
        'instagram',
        'instagram-standalone',
        'linkedin-page',
        'pinterest',
        'youtube',
        'threads',
        'gmb',
        'x',
        'tiktok',
        'tiktok-business',
      ].indexOf(currentIntegration.identifier) !== -1
    ) {
      arr.push({
        key: 30,
        value: t('last_30_days', 'Last 30 days'),
      });
    }
    if (
      ['facebook', 'linkedin-page', 'pinterest', 'youtube', 'x', 'gmb'].indexOf(
        currentIntegration.identifier
      ) !== -1
    ) {
      arr.push({
        key: 90,
        value: t('last_90_days', 'Last 90 days'),
      });
    }
    return arr;
  }, [currentIntegration, t]);
  const keys = useMemo(() => {
    if (!currentIntegration) {
      return 7;
    }
    if (options.find((p) => p.key === key)) {
      return key;
    }
    return options[0]?.key;
  }, [key, currentIntegration]);

  if (isLoading) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  // The phone's channel button, which opens the sheet: the chosen channel, or
  // with none that can be picked the list's hint, so the sheet and its
  // Reconnect stay in reach.
  const channelButton = (
    <button
      type="button"
      onClick={() => setChannelsOpen(true)}
      aria-expanded={channelsOpen}
      aria-label={
        currentIntegration
          ? t(
              'change_channel_named',
              'Channel: {{name}} on {{platform}}. Change channel',
              {
                name: currentIntegration.name,
                platform: platformLabel(currentIntegration.identifier),
                // React escapes the label, so i18next mustn't first
                interpolation: { escapeValue: false },
              }
            )
          : undefined
      }
      className={clsx(
        'hidden mobile:flex items-center gap-[10px] h-[56px] px-[12px] rounded-[10px] border border-line cursor-pointer',
        FOCUS_RING
      )}
    >
      {currentIntegration ? (
        <ChosenChannel channel={currentIntegration} phone />
      ) : (
        <span className="flex-1 min-w-0 text-start text-[14px] font-[500] text-ink">
          {t('channel_hint_analytics', 'Pick a channel to see its numbers.')}
        </span>
      )}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="text-muted"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );

  return (
    <div className="flex flex-1 min-w-0 gap-[1px] mobile:flex-col">
      <div className="bg-newBgColorInner flex-1 min-w-0 flex-col flex p-[20px] mobile:p-[12px] gap-[12px]">
        {currentIntegration ? (
          <>
            {/* The top bar. At 1025px and below the channel button takes the
                channel's place, and the period sits under it, the full
                width. */}
            <div className="flex items-center gap-[12px] mobile:flex-col mobile:items-stretch">
              <div className="flex items-center gap-[12px] min-w-0 mobile:hidden">
                <ChosenChannel channel={currentIntegration} />
              </div>
              {channelButton}
              {/* the calendar's view control, as one-click radios */}
              <div
                role="radiogroup"
                aria-label={t('period', 'Period')}
                className="flex shrink-0 gap-[2px] p-[4px] ms-auto border border-newTableBorder rounded-[8px] text-[14px] font-[500] coarse:min-h-[54px] mobile:ms-0 mobile:w-full"
              >
                {options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={keys === option.key}
                    onClick={() => setKey(option.key)}
                    className={clsx(
                      'pt-[6px] pb-[5px] px-[12px] rounded-[6px] text-center whitespace-nowrap cursor-pointer coarse:flex coarse:justify-center coarse:items-center coarse:min-w-[44px] mobile:flex-1',
                      FOCUS_RING,
                      keys === option.key &&
                        'text-brandText bg-brandSoft font-[600]'
                    )}
                  >
                    {option.value}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              {/* drawn anew for each channel and period, so a switch back
                  loads its numbers again on mount */}
              <RenderAnalytics
                key={`${currentIntegration.id}-${keys}`}
                integration={currentIntegration}
                date={keys}
              />
            </div>
          </>
        ) : data.length ? (
          // Channels, but none to pick: their rows say why and offer the fix,
          // so the page says to pick one; on a phone the button says it.
          <>
            {channelButton}
            <EmptyState
              illustration={<AnalyticsEmptyIllustration />}
              title={t(
                'channel_hint_analytics',
                'Pick a channel to see its numbers.'
              )}
              className="mobile:hidden"
            />
          </>
        ) : (
          <EmptyState
            illustration={<AnalyticsEmptyIllustration />}
            title={t(
              'analytics_empty_title',
              'Track how your content performs'
            )}
            description={t(
              'analytics_empty_description',
              'Connect a channel and Sharek shows your reach, engagement, and follower growth — all in one place.'
            )}
            note={`${t('works_with', 'Works with')} ${supportedPlatforms}`}
            actionLabel={t('connect_a_channel', 'Connect a channel')}
            onAction={() => router.push('/launches')}
          />
        )}
      </div>
      <SplitPanel
        open={channelsOpen}
        onClose={() => setChannelsOpen(false)}
        collapsed={railCollapsed}
        width="w-[288px]"
        label={t('channels', 'Channels')}
      >
        <ChannelPanel
          mode="analytics"
          channels={data}
          selected={currentIntegration?.id ?? null}
          onChange={(id) => {
            setChosen(id);
            // one choice, so a pick closes the sheet; the rail stays
            setChannelsOpen(false);
          }}
          hasStatistics={hasStatistics}
          update={mutate}
          collapsed={railCollapsed}
          onToggleCollapse={() =>
            setCollapseMenu(collapseMenu === '1' ? '0' : '1')
          }
          onDone={() => setChannelsOpen(false)}
        />
      </SplitPanel>
    </div>
  );
};
