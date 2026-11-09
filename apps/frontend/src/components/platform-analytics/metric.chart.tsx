'use client';

import { FC, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import DrawChart from 'chart.js/auto';
import i18next from 'i18next';
import useCookie from 'react-use-cookie';
import { TotalList } from '@gitroom/frontend/components/analytics/stars.and.forks.interface';
import {
  chartColorSchemes,
  chartTooltipColors,
} from '@gitroom/frontend/components/analytics/chart-social';
import {
  REDUCED_MOTION_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// The keys that move the readout, along the time axis, which runs left to
// right in both languages
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };

// The page's language for Analytics' numbers and dates, the chart's and the
// headlines' alike, with Latin digits in Arabic too, as formatResetDate has
// them
export const pageLocale = () => {
  const language = i18next.resolvedLanguage || 'en';
  return language === 'ar' ? 'ar-u-nu-latn' : language;
};

// One metric over its period on Analytics (spec 051, R20): every daily point,
// on axes labelled with short dates and numbers in thousands in the page's
// language, in the brand's colour. The canvas takes the keyboard too: the
// arrow keys move the tooltip from day to day, and a live line reads the same
// date and value out.
export const MetricChart: FC<{
  label: string;
  data: TotalList[];
}> = ({ label, data }) => {
  const t = useT();
  const [mode] = useCookie('mode', 'dark');
  // chart.js animates the canvas itself, out of global.scss's reach (C26)
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<DrawChart<'line'> | null>(null);
  const active = useRef<number | null>(null);
  const [readout, setReadout] = useState('');

  const locale = pageLocale();
  const format = useMemo(() => {
    // A point is the calendar day it names, its first 10 characters,
    // YYYY-MM-DD, whatever time follows: alone they parse as midnight UTC, so
    // the browser's zone never moves the day
    const day = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return {
      dates: data.map((point) => day.format(new Date(point.date.slice(0, 10)))),
      value: new Intl.NumberFormat(locale),
      thousands: new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    };
  }, [data, locale]);

  useEffect(() => {
    if (!data.length) {
      return;
    }
    const colors = chartColorSchemes(mode).purple;
    // ChartSocial's tooltip colours; its border and body are the line and
    // muted tokens, which the gridlines and the ticks take
    const tooltip = chartTooltipColors(mode);

    active.current = null;
    chart.current = new DrawChart(ref.current!, {
      type: 'line',
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: reducedMotion
          ? false
          : {
              duration: 750,
              easing: 'easeOutQuart',
            },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            grid: {
              display: false,
            },
            border: {
              display: false,
            },
            ticks: {
              color: tooltip.bodyColor,
              maxRotation: 0,
              maxTicksLimit: 7,
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: tooltip.borderColor,
            },
            border: {
              display: false,
            },
            ticks: {
              color: tooltip.bodyColor,
              maxTicksLimit: 5,
              callback: (tick) => format.thousands.format(Number(tick)),
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            ...tooltip,
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            titleFont: {
              size: 12,
              weight: 'normal',
            },
            bodyFont: {
              size: 14,
              weight: 'bold',
            },
            callbacks: {
              label: (item) => format.value.format(item.parsed.y),
            },
          },
        },
      },
      data: {
        labels: format.dates,
        datasets: [
          {
            borderColor: colors.border,
            borderWidth: 2,
            backgroundColor: colors.end,
            fill: true,
            data: data.map((point) => point.total),
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: colors.border,
            pointHoverBorderColor: tooltip.backgroundColor,
            pointHoverBorderWidth: 2,
          },
        ],
      },
    });
    return () => {
      chart.current?.destroy();
    };
  }, [data, format, mode, reducedMotion]);

  // The tooltip on the day the keys reached, as a hover shows it, or on none.
  const show = (index: number | null) => {
    const current = chart.current!;
    const elements = index === null ? [] : [{ datasetIndex: 0, index }];
    const point =
      index === null ? { x: 0, y: 0 } : current.getDatasetMeta(0).data[index];
    active.current = index;
    current.setActiveElements(elements);
    current.tooltip?.setActiveElements(elements, { x: point.x, y: point.y });
    current.update();
    setReadout(
      index === null
        ? ''
        : `${format.dates[index]}: ${format.value.format(data[index].total)}`
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = STEPS[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    // the first key starts from the end it points away from
    const from = active.current ?? (step > 0 ? -1 : data.length);
    show(Math.min(data.length - 1, Math.max(0, from + step)));
  };

  if (!data.length) {
    return (
      <div className="h-[340px] mobile:h-[200px] flex items-center justify-center text-[14px] text-muted">
        {t('no_data_for_period', 'No data for this period')}
      </div>
    );
  }

  return (
    <div className="relative h-[340px] mobile:h-[200px]">
      <canvas
        ref={ref}
        className="w-full h-full rounded-[8px] focus-visible:ring-2 focus-visible:ring-brand"
        tabIndex={0}
        role="img"
        aria-label={label}
        onKeyDown={onKeyDown}
        onBlur={() => show(null)}
      />
      <p className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  );
};
