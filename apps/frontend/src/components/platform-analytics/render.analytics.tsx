import { FC, useCallback, useMemo } from 'react';
import { Integration } from '@prisma/client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { CHART_CARD_HUES as CARD_HUES } from '@gitroom/frontend/components/analytics/chart-social';
import {
  MetricChart,
  pageLocale,
} from '@gitroom/frontend/components/platform-analytics/metric.chart';
import { useReconnectChannel } from '@gitroom/frontend/components/launches/channel.panel';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import i18next from 'i18next';

interface AnalyticsDataItem {
  label: string;
  data: Array<{ total: number; date: string }>;
  average?: boolean;
  percentageChange?: number;
}

export const metricLabel = (label: string): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return i18next.t(`analytics_metric_${slug}`, label);
};

const TrendIndicator: FC<{ value: number; average?: boolean }> = ({
  value,
  average,
}) => {
  if (value === 0) return null;

  const isPositive = value > 0;
  const displayValue = Math.abs(value).toFixed(1);

  return (
    <div
      className={`flex items-center gap-[4px] text-[13px] font-medium ${
        isPositive ? 'text-success' : 'text-error'
      }`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className={isPositive ? '' : 'rotate-180'}
      >
        <path
          d="M6 2.5L10 7.5H2L6 2.5Z"
          fill="currentColor"
        />
      </svg>
      <span>
        {displayValue}
        {average ? 'pp' : '%'}
      </span>
    </div>
  );
};

// Instagram and Threads send a total as one point, and X pads each of its
// totals with a 0 at the period's start, so 1 or 2 points are a total. A
// series has a point a day, and one with none this period is still a chart,
// which says it has no data (R19).
const isTotal = (item: AnalyticsDataItem) =>
  item.data.length > 0 && item.data.length < 3;

const AnalyticsTile: FC<{
  item: AnalyticsDataItem;
  total: string;
}> = ({ item, total }) => {
  return (
    <div className="flex flex-col gap-[4px] px-[16px] py-[14px] mobile:px-[12px] mobile:py-[10px] bg-surface border border-line rounded-[12px]">
      <span className="text-[13px] font-medium text-muted">
        {metricLabel(item.label)}
      </span>
      <div className="flex items-baseline gap-[10px]">
        <span className="text-[26px] mobile:text-[20px] leading-tight font-semibold tracking-tight text-ink">
          {total}
        </span>
        {item.percentageChange !== undefined && (
          <TrendIndicator
            value={item.percentageChange}
            average={item.average}
          />
        )}
      </div>
    </div>
  );
};

const AnalyticsChart: FC<{
  item: AnalyticsDataItem;
  total: string;
  date: number;
  index: number;
}> = ({ item, total, date, index }) => {
  const t = useT();
  const name = metricLabel(item.label);

  return (
    <figure className="flex flex-col gap-[2px] min-w-0 px-[16px] pt-[16px] pb-[10px] bg-surface border border-line rounded-[14px]">
      <figcaption className="text-[14px] font-semibold text-ink">
        {name}
      </figcaption>
      <div className="flex items-baseline gap-[10px]">
        <span className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {total}
        </span>
        {item.percentageChange !== undefined && (
          <TrendIndicator
            value={item.percentageChange}
            average={item.average}
          />
        )}
      </div>
      <span className="text-[12px] text-muted">
        {item.average
          ? t(`average_last_${date}_days`, `Average for the last ${date} days`)
          : t(`total_last_${date}_days`, `Total for the last ${date} days`)}
      </span>
      <div className="mt-[10px]">
        <MetricChart
          label={name}
          data={item.data}
          color={CARD_HUES[index % CARD_HUES.length]}
        />
      </div>
    </figure>
  );
};

const EmptyState: FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const t = useT();

  return (
    <div className="flex flex-col items-center justify-center py-[48px] px-[24px] bg-newTableHeader border border-newTableBorder rounded-[12px]">
      <div className="w-[48px] h-[48px] mb-[16px] rounded-full bg-brandSoft flex items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-brand"
        >
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <p className="text-[15px] text-newTableText text-center mb-[12px]">
        {t(
          'this_channel_needs_to_be_refreshed',
          'This channel needs to be refreshed to display analytics'
        )}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-[6px] px-[16px] py-[8px] coarse:min-h-[44px] text-[14px] font-medium text-ink bg-quiet border border-line hover:bg-surface2 rounded-[8px] transition-colors focus-visible:ring-2 focus-visible:ring-brand"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M23 4v6h-6M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
        {t('reconnect', 'Reconnect')}
      </button>
    </div>
  );
};

export const RenderAnalytics: FC<{
  integration: Integration;
  date: number;
}> = (props) => {
  const { integration, date } = props;
  const fetch = useFetch();

  // A failed answer (a 502 while the backend restarts has a JSON body too) is
  // an error SWR asks again for, never numbers to draw
  const load = useCallback(async () => {
    const response = await fetch(`/analytics/${integration.id}?date=${date}`);
    if (!response.ok) {
      throw new Error('Failed to load analytics');
    }
    return response.json();
  }, [integration, date]);

  // SWR's own loading, per channel and period, so a slower answer for another
  // channel never ends this one's (the page draws this anew for each)
  const { data, isLoading } = useSWR(
    `/analytics-${integration?.id}-${date}`,
    load,
    {
      refreshInterval: 0,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshWhenOffline: false,
      revalidateOnMount: true,
    }
  );

  const reconnect = useReconnectChannel();

  const t = useT();

  // the chart's numbers, in the page's language
  const locale = pageLocale();
  const totals = useMemo(() => {
    return data?.map((p: AnalyticsDataItem) => {
      const value =
        (p?.data.reduce((acc: number, curr: { total: number }) => acc + curr.total, 0) || 0) /
        (p.average ? p.data.length || 1 : 1);
      if (p.average) {
        return value.toFixed(2) + '%';
      }
      return new Intl.NumberFormat(locale).format(Math.round(value));
    });
  }, [data, locale]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[48px]">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] mobile:gap-[12px]">
      {data?.length === 0 && (
        <EmptyState
          onRefresh={reconnect(
            integration as Integration & { identifier: string }
          )}
        />
      )}
      {data?.some(isTotal) && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-[12px] mobile:grid-cols-2 mobile:gap-[8px]">
          {data.map(
            (item: AnalyticsDataItem, index: number) =>
              isTotal(item) && (
                <AnalyticsTile
                  key={`analytics-${index}`}
                  item={item}
                  total={totals[index]}
                />
              )
          )}
        </div>
      )}
      {data?.some((item: AnalyticsDataItem) => !isTotal(item)) && (
        <div className="grid grid-cols-2 gap-[16px] items-start mobile:grid-cols-1 mobile:gap-[10px]">
          {data.map(
            (item: AnalyticsDataItem, index: number) =>
              !isTotal(item) && (
                <AnalyticsChart
                  key={`analytics-${index}`}
                  item={item}
                  total={totals[index]}
                  date={date}
                  index={index}
                />
              )
          )}
        </div>
      )}
    </div>
  );
};
