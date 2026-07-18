'use client';

import { FC, useEffect, useMemo, useRef } from 'react';
import DrawChart from 'chart.js/auto';
import { TotalList } from '@gitroom/frontend/components/analytics/stars.and.forks.interface';
import { chunk } from 'lodash';
import useCookie from 'react-use-cookie';

// Per-card palette for analytics grids: cycle the 6 v3 categorical slots so
// each metric card reads distinctly instead of a single blue. The chart hue
// (ChartSocial `color`) and the header dot must stay index-aligned.
export const CHART_CARD_HUES = [
  'pomegranate',
  'saffron',
  'fayrouz',
  'palm',
  'lapis',
  'clay',
] as const;
export const CHART_CARD_DOTS = [
  'bg-catPomegranate',
  'bg-catSaffron',
  'bg-catFayrouz',
  'bg-catPalm',
  'bg-catLapis',
  'bg-catClay',
];

function mergeDataPoints(data: TotalList[], numPoints: number): TotalList[] {
  const res = chunk(data, Math.ceil(data.length / numPoints));
  return res.map((row) => {
    return {
      date: `${row[0].date} - ${row?.at(-1)?.date}`,
      total: row.reduce((acc, curr) => acc + curr.total, 0),
    };
  });
}

export const ChartSocial: FC<{
  data: TotalList[];
  color?:
    | 'purple'
    | 'green'
    | 'blue'
    | 'pomegranate'
    | 'saffron'
    | 'fayrouz'
    | 'palm'
    | 'lapis'
    | 'clay';
}> = (props) => {
  const { data, color = 'purple' } = props;
  const [mode] = useCookie('mode', 'dark');

  const list = useMemo(() => {
    const merged = data.length < 7 ? data : mergeDataPoints(data, 7);
    if (merged.length === 1) {
      return [
        // duplicating single datapoints metrics for chart to display a line on analytics
        merged[0],
        merged[0],
      ];
    }
    return merged;
  }, [data]);

  const ref = useRef<any>(null);
  const chart = useRef<null | DrawChart>(null);

  // Series colors match the legend badges in statistics.tsx / render.analytics.tsx:
  // purple→brand, green→success, blue→info. Literal per-theme RGB because Chart.js
  // paints on canvas and can't resolve CSS vars (data-model §8).
  const colorSchemes = {
    purple: {
      start: 'rgba(185, 45, 67, 0.8)',
      end: 'rgba(185, 45, 67, 0.1)',
      border: 'rgb(185, 45, 67)',
    },
    green: {
      start: mode === 'dark' ? 'rgba(61, 214, 140, 0.8)' : 'rgba(30, 158, 90, 0.8)',
      end: mode === 'dark' ? 'rgba(61, 214, 140, 0.1)' : 'rgba(30, 158, 90, 0.1)',
      border: mode === 'dark' ? 'rgb(61, 214, 140)' : 'rgb(30, 158, 90)',
    },
    blue: {
      start: mode === 'dark' ? 'rgba(138, 176, 232, 0.8)' : 'rgba(62, 99, 168, 0.8)',
      end: mode === 'dark' ? 'rgba(138, 176, 232, 0.1)' : 'rgba(62, 99, 168, 0.1)',
      border: mode === 'dark' ? 'rgb(138, 176, 232)' : 'rgb(62, 99, 168)',
    },
    // v3 categorical slots (colors.scss §categorical) — cycled per analytics
    // card so each metric reads distinctly instead of a single blue.
    pomegranate: {
      start: mode === 'dark' ? 'rgba(224, 99, 120, 0.8)' : 'rgba(185, 45, 67, 0.8)',
      end: mode === 'dark' ? 'rgba(224, 99, 120, 0.1)' : 'rgba(185, 45, 67, 0.1)',
      border: mode === 'dark' ? 'rgb(224, 99, 120)' : 'rgb(185, 45, 67)',
    },
    saffron: {
      start: mode === 'dark' ? 'rgba(196, 133, 25, 0.8)' : 'rgba(201, 133, 0, 0.8)',
      end: mode === 'dark' ? 'rgba(196, 133, 25, 0.1)' : 'rgba(201, 133, 0, 0.1)',
      border: mode === 'dark' ? 'rgb(196, 133, 25)' : 'rgb(201, 133, 0)',
    },
    fayrouz: {
      start: mode === 'dark' ? 'rgba(47, 163, 184, 0.8)' : 'rgba(10, 128, 166, 0.8)',
      end: mode === 'dark' ? 'rgba(47, 163, 184, 0.1)' : 'rgba(10, 128, 166, 0.1)',
      border: mode === 'dark' ? 'rgb(47, 163, 184)' : 'rgb(10, 128, 166)',
    },
    palm: {
      start: mode === 'dark' ? 'rgba(85, 160, 63, 0.8)' : 'rgba(78, 148, 50, 0.8)',
      end: mode === 'dark' ? 'rgba(85, 160, 63, 0.1)' : 'rgba(78, 148, 50, 0.1)',
      border: mode === 'dark' ? 'rgb(85, 160, 63)' : 'rgb(78, 148, 50)',
    },
    lapis: {
      start: mode === 'dark' ? 'rgba(110, 147, 220, 0.8)' : 'rgba(62, 99, 168, 0.8)',
      end: mode === 'dark' ? 'rgba(110, 147, 220, 0.1)' : 'rgba(62, 99, 168, 0.1)',
      border: mode === 'dark' ? 'rgb(110, 147, 220)' : 'rgb(62, 99, 168)',
    },
    clay: {
      start: mode === 'dark' ? 'rgba(207, 107, 54, 0.8)' : 'rgba(192, 98, 44, 0.8)',
      end: mode === 'dark' ? 'rgba(207, 107, 54, 0.1)' : 'rgba(192, 98, 44, 0.1)',
      border: mode === 'dark' ? 'rgb(207, 107, 54)' : 'rgb(192, 98, 44)',
    },
  };

  const colors = colorSchemes[color];

  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, ref.current.height);
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(1, colors.end);

    chart.current = new DrawChart(ref.current!, {
      type: 'line',
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: {
          duration: 750,
          easing: 'easeOutQuart',
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        layout: {
          padding: {
            left: 0,
            right: 0,
            top: 4,
            bottom: 0,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            display: false,
          },
          x: {
            display: false,
            ticks: {
              stepSize: 10,
              maxTicksLimit: 7,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            backgroundColor: mode === 'dark' ? '#1D1518' : '#F7F5F4',
            titleColor: mode === 'dark' ? '#F7F1EF' : '#1A1413',
            bodyColor: mode === 'dark' ? '#AEA09D' : '#6F635F',
            borderColor: mode === 'dark' ? 'rgba(255,255,255,0.14)' : '#CFC9C6',
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
          },
        },
      },
      data: {
        labels: list.map((row) => row.date),
        datasets: [
          {
            borderColor: colors.border,
            borderWidth: 2,
            label: 'Total',
            backgroundColor: gradient,
            fill: true,
            data: list.map((row) => row.total),
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: colors.border,
            pointHoverBorderColor: mode === 'dark' ? '#1D1518' : '#F7F5F4',
            pointHoverBorderWidth: 2,
          },
        ],
      },
    });
    return () => {
      chart?.current?.destroy();
    };
  }, []);

  return <canvas className="w-full h-full" ref={ref} />;
};
