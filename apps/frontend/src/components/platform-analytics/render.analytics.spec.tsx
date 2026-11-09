import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as fs from 'fs';
import * as path from 'path';

// The names and change figures on the Analytics cards (spec 051, FR-033 and
// FR-034). Each provider returns its metric's name in English, and metricLabel
// reads it through an analytics_metric_<slug> key in the page's language, so
// the cases load the real en and ar translations: a slug that drifted would
// land on a key nobody translated and show the provider's English.
const request = jest.fn();
// Gives back the English default, and records the key it was asked for.
const mockT = jest.fn((key: string, fallback: string) => fallback);
const mockReconnect = jest.fn();
const mockRunReconnect = jest.fn();

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => mockT,
}));
// MetricChart draws on chart.js, which needs a canvas the test DOM doesn't
// have, and metric.chart.spec covers what it draws; the stand-in shows the
// name, the points and the colour it was given. The page's locale is the real
// one.
jest.mock(
  '@gitroom/frontend/components/platform-analytics/metric.chart',
  () => ({
    ...jest.requireActual(
      '@gitroom/frontend/components/platform-analytics/metric.chart'
    ),
    MetricChart: (props: { label: string; data: unknown; color: string }) => (
      <div
        data-testid="metric-chart"
        data-label={props.label}
        data-points={JSON.stringify(props.data)}
        data-color={props.color}
      />
    ),
  })
);
// The channel list's Reconnect, a channel in and a handler out (R4).
jest.mock('@gitroom/frontend/components/launches/channel.panel', () => ({
  useReconnectChannel: () => mockReconnect,
}));

import i18next from 'i18next';
import { SWRConfig } from 'swr';
import { Integration } from '@prisma/client';
import {
  metricLabel,
  RenderAnalytics,
} from '@gitroom/frontend/components/platform-analytics/render.analytics';

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        `../../../../../libraries/react-shared-libraries/src/translation/locales/${lng}/translation.json`
      ),
      'utf8'
    )
  );

const en = readLocale('en');
const ar = readLocale('ar');

// [provider label, slug], the rows of contracts/analytics-metrics.md. The slug
// is the label in lower case, each run of characters other than a to z and 0 to
// 9 turned into one _, with no _ at either end. The en and ar names each key
// holds are pinned to the contract by analytics.metrics.locale.keys.spec.ts.
const METRICS: ReadonlyArray<readonly [string, string]> = [
  ['Page Impressions', 'page_impressions'],
  ['Posts Engagement', 'posts_engagement'],
  ['Page followers', 'page_followers'],
  ['Media views', 'media_views'],
  ['Follower Count', 'follower_count'],
  ['Followers', 'followers'],
  ['Reach', 'reach'],
  ['Views', 'views'],
  ['Likes', 'likes'],
  ['Comments', 'comments'],
  ['Shares', 'shares'],
  ['Saves', 'saves'],
  ['Replies', 'replies'],
  ['Page Views', 'page_views'],
  ['Clicks', 'clicks'],
  ['Engagement', 'engagement'],
  ['Organic Followers', 'organic_followers'],
  ['Paid Followers', 'paid_followers'],
  ['Reposts', 'reposts'],
  ['Quotes', 'quotes'],
  ['IMPRESSION', 'impression'],
  ['BOOKMARK', 'bookmark'],
  ['LIKE', 'like'],
  ['QUOTE', 'quote'],
  ['REPLY', 'reply'],
  ['RETWEET', 'retweet'],
  ['Impressions', 'impressions'],
  ['Pin Clicks', 'pin_clicks'],
  ['Pin click rate', 'pin_click_rate'],
  ['Following', 'following'],
  ['Recent Comments', 'recent_comments'],
  ['Recent Likes', 'recent_likes'],
  ['Recent Shares', 'recent_shares'],
  ['Total Likes', 'total_likes'],
  ['Videos', 'videos'],
  ['Estimated Minutes Watched', 'estimated_minutes_watched'],
  ['Average View Duration', 'average_view_duration'],
  ['Average View Percentage', 'average_view_percentage'],
  ['Subscribers Gained', 'subscribers_gained'],
  ['Subscribers Lost', 'subscribers_lost'],
  ['Website Clicks', 'website_clicks'],
  ['Phone Calls', 'phone_calls'],
  ['Direction Requests', 'direction_requests'],
  ['Desktop Map Views', 'desktop_map_views'],
  ['Mobile Map Views', 'mobile_map_views'],
];

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
  });
});

const mounted: Root[] = [];
const channel = { id: 'ch1' } as Integration;

// The cards for one channel over `date` days, with the analytics request
// answering `items`. A fresh SWR cache per render, so one case's answer never
// reaches the next.
const render = async (items: unknown[], date = 7) => {
  request.mockResolvedValue({ ok: true, json: async () => items });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <RenderAnalytics integration={channel} date={date} />
      </SWRConfig>
    );
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return host;
};

const item = (label: string, percentageChange: number) => ({
  label,
  data: [
    { total: 10, date: '2026-11-01' },
    { total: 5, date: '2026-11-02' },
  ],
  percentageChange,
});

// A point a day from 1 November 2026, one per total.
const points = (totals: number[]) =>
  totals.map((total, index) => ({
    total,
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
  }));
const metric = (
  label: string,
  totals: number[],
  extra: { average?: boolean; percentageChange?: number } = {}
) => ({ label, data: points(totals), percentageChange: 0, ...extra });

const classes = (node: Element | null | undefined) =>
  (node?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
// The element holding exactly this text and no element of its own.
const leaf = (root: Element, text: string) =>
  Array.from(root.querySelectorAll('*')).find(
    (el) => el.children.length === 0 && el.textContent === text
  );
// The innermost element holding both.
const commonBox = (a: Element, b: Element) => {
  let box = a.parentElement;
  while (box && !box.contains(b)) box = box.parentElement;
  return box;
};
const chartOf = (figure: Element) =>
  figure.querySelector('[data-testid="metric-chart"]')!;

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  request.mockReset();
  mockT.mockClear();
  mockReconnect.mockReset();
  mockRunReconnect.mockReset();
  await i18next.changeLanguage('en');
});

describe.each([
  ['en', en],
  ['ar', ar],
])('metric names with %s loaded', (lng, locale) => {
  beforeEach(async () => {
    await i18next.changeLanguage(lng);
  });

  it.each(METRICS)('names %s through analytics_metric_%s', (label, slug) => {
    expect(metricLabel(label)).toBe(locale[`analytics_metric_${slug}`]);
  });

  // Google Business passes a metric it doesn't name through as its raw API
  // name, which no key holds.
  it('gives back a label no key holds as it is', () => {
    expect(metricLabel('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH')).toBe(
      'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH'
    );
  });

  // The slug drops a run of other characters at either end, so a label with
  // stray spaces or punctuation around it still finds its key.
  it('finds the key of a label with other characters at either end', () => {
    expect(metricLabel(' (Reach) ')).toBe(locale.analytics_metric_reach);
  });

  it("shows the card's name in the page's language, not the provider's", async () => {
    const host = await render([item('Page Impressions', 0)]);

    expect(host.textContent).toContain(
      locale.analytics_metric_page_impressions
    );
    expect(host.textContent).not.toContain('Page Impressions');
  });
});

describe('the change figure on a card', () => {
  it('shows nothing for a change of 0', async () => {
    const host = await render([item('Reach', 0)]);

    expect(host.querySelector('.text-success, .text-error')).toBeNull();
    expect(host.textContent).not.toContain('%');
  });

  // A provider that computes a real change later still gets its figure.
  it('shows a change other than 0', async () => {
    const host = await render([item('Reach', 12.5)]);

    expect(host.querySelector('.text-success')!.textContent).toBe('12.5%');
  });
});

// Instagram and Threads send a total as one point, and X pads each of its
// totals with a 0 at the period's start, so 1 or 2 points are a total, shown
// as a tile. A series has a point a day and is a chart (R19).
describe('tiles and charts', () => {
  it('draws a chart for each metric with 3 or more points, and a tile for each with 1 or 2', async () => {
    const host = await render([
      metric('Followers', [480]),
      metric('IMPRESSION', [0, 1234]),
      metric('Page followers', [120, 340, 560]),
      metric('Page Impressions', [1, 2, 3, 4, 5, 6, 7]),
    ]);
    const names = [
      en.analytics_metric_page_followers,
      en.analytics_metric_page_impressions,
    ];

    const charts = Array.from(host.querySelectorAll('figure'));
    expect(
      charts.map((figure) => figure.querySelector('figcaption')?.textContent)
    ).toEqual(names);
    // named in the page's language, with every point as the provider sent it
    expect(
      charts.map((figure) => chartOf(figure).getAttribute('data-label'))
    ).toEqual(names);
    expect(
      charts.map((figure) =>
        JSON.parse(chartOf(figure).getAttribute('data-points')!)
      )
    ).toEqual([points([120, 340, 560]), points([1, 2, 3, 4, 5, 6, 7])]);
    expect(host.querySelectorAll('[data-testid="metric-chart"]')).toHaveLength(
      2
    );
    [en.analytics_metric_followers, en.analytics_metric_impression].forEach(
      (name) => {
        const tile = leaf(host, name);
        expect(tile).toBeDefined();
        expect(tile!.closest('figure')).toBeNull();
      }
    );
  });

  // Each chart takes the supporting brand hue of its metric's place in the
  // list, as the cards did before spec 051 and post statistics still do, so a
  // metric keeps its colour whether the ones before it are tiles or charts.
  it("colours each chart by its metric's place in the list, cycling the six hues", async () => {
    const host = await render([
      metric('Followers', [480]),
      metric('Page Impressions', [1, 2, 3]),
      metric('Page followers', [4, 5, 6]),
      metric('Reach', [7, 8, 9]),
      metric('Likes', [1]),
      metric('Views', [1]),
      metric('Page Impressions', [2, 3, 4]),
    ]);

    expect(
      Array.from(host.querySelectorAll('[data-testid="metric-chart"]')).map(
        (chart) => chart.getAttribute('data-color')
      )
    ).toEqual(['saffron', 'fayrouz', 'palm', 'pomegranate']);
  });

  // A totals platform always sends its one point, so a metric with none this
  // period is a series with no data: a chart, whose MetricChart says so, with a
  // headline of 0 (spec.md, Edge Cases: tiles show 0 and charts an empty state).
  it('draws a metric with no points as a chart, and hands MetricChart the empty series', async () => {
    const host = await render([metric('Reach', [])]);

    const figure = host.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector('figcaption')!.textContent).toBe(
      en.analytics_metric_reach
    );
    expect(chartOf(figure!).getAttribute('data-points')).toBe('[]');
    expect(leaf(figure!, '0')).toBeDefined();
    expect(figure!.textContent).toContain('Total for the last 7 days');
  });

  // An average over no days is 0 too, not 0 / 0 (quickstart, walk 4 step 8).
  it('heads an average with no points 0.00%', async () => {
    const host = await render([
      metric('Average View Percentage', [], { average: true }),
    ]);

    const figure = host.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(leaf(figure!, '0.00%')).toBeDefined();
    expect(figure!.textContent).not.toContain('NaN');
    expect(figure!.textContent).toContain('Average for the last 7 days');
  });

  // A tile is its name and value; only a chart says what the value covers.
  it.each([7, 30, 90])(
    'heads a tile with its sum, and a chart with its sum and "Total for the last %i days"',
    async (date) => {
      const host = await render(
        [metric('IMPRESSION', [0, 1234]), metric('Reach', [1000, 2000, 2345])],
        date
      );
      const format = new Intl.NumberFormat();

      const figure = host.querySelector('figure');
      expect(figure).not.toBeNull();
      expect(figure!.textContent).toContain(format.format(5345));
      expect(figure!.textContent).toContain(`Total for the last ${date} days`);
      expect(figure!.textContent).not.toContain(format.format(1234));
      expect(host.textContent).toContain(format.format(1234));
      expect(host.textContent!.split('for the last')).toHaveLength(2);
      expect(mockT).toHaveBeenCalledWith(
        `total_last_${date}_days`,
        `Total for the last ${date} days`
      );
    }
  );

  it.each([7, 30, 90])(
    'heads an average with a percentage to two decimals, and its chart with "Average for the last %i days"',
    async (date) => {
      const host = await render(
        [
          metric('Pin click rate', [1.5, 2], { average: true }),
          metric('Average View Percentage', [2, 3, 5], { average: true }),
        ],
        date
      );

      const figure = host.querySelector('figure');
      expect(figure).not.toBeNull();
      expect(figure!.textContent).toContain('3.33%');
      expect(figure!.textContent).toContain(
        `Average for the last ${date} days`
      );
      expect(figure!.textContent).not.toContain('1.75%');
      expect(host.textContent).toContain('1.75%');
      expect(host.textContent!.split('for the last')).toHaveLength(2);
      expect(mockT).toHaveBeenCalledWith(
        `average_last_${date}_days`,
        `Average for the last ${date} days`
      );
    }
  );
});

// The headlines read numbers in the page's language, as the chart's axis and
// readout do: Latin digits on an Arabic page, whatever the browser's own.
describe("numbers in the page's language", () => {
  const RealNumberFormat = Intl.NumberFormat;

  beforeEach(async () => {
    await i18next.changeLanguage('ar');
    // a browser set to Egyptian Arabic, whose digits are Arabic-Indic
    Intl.NumberFormat = function (
      locales?: string | string[],
      options?: Intl.NumberFormatOptions
    ) {
      return new RealNumberFormat(locales ?? 'ar-EG', options);
    } as typeof Intl.NumberFormat;
  });
  afterEach(() => {
    Intl.NumberFormat = RealNumberFormat;
  });

  it('heads a chart and a tile with Latin digits on an Arabic page', async () => {
    const host = await render([
      metric('IMPRESSION', [0, 1234]),
      metric('Reach', [1000, 2000, 2345]),
    ]);

    const figure = host.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(leaf(figure!, '5,345')).toBeDefined();
    expect(leaf(host, '1,234')).toBeDefined();
    expect(host.textContent).not.toMatch(/[٠-٩]/);
  });
});

describe('the change figure on a chart', () => {
  it('shows nothing for a change of 0', async () => {
    const host = await render([metric('Reach', [1, 2, 3])]);

    const figure = host.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector('.text-success, .text-error')).toBeNull();
    expect(figure!.textContent).not.toContain('%');
  });

  it.each([
    [12.5, '.text-success', '12.5%'],
    [-4, '.text-error', '4.0%'],
  ])('shows a change of %d', async (change, selector, text) => {
    const host = await render([
      metric('Reach', [1, 2, 3], { percentageChange: change }),
    ]);

    const figure = host.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector(selector)!.textContent).toBe(text);
  });
});

// At 1025px and below (mobile:), the tiles sit two to a row and the charts
// one to a row, under the tiles (FR-042, the AnalyticsPhone board).
describe('the layout at 1025px and below', () => {
  const metrics = [
    metric('Followers', [480]),
    metric('IMPRESSION', [0, 1234]),
    metric('Reach', [1, 2, 3]),
    metric('Views', [1, 2, 3, 4]),
  ];

  it('sets the tiles two to a row', async () => {
    const host = await render(metrics);

    const tiles = commonBox(
      leaf(host, en.analytics_metric_followers)!,
      leaf(host, en.analytics_metric_impression)!
    );
    expect(classes(tiles)).toContain('grid');
    expect(classes(tiles)).toContain('mobile:grid-cols-2');
    expect(tiles!.querySelector('figure')).toBeNull();
  });

  it('stacks the charts under the tiles', async () => {
    const host = await render(metrics);

    const [reach, views] = Array.from(host.querySelectorAll('figure'));
    expect(views).toBeDefined();
    const charts = commonBox(reach, views);
    expect(classes(charts)).toContain('grid');
    expect(classes(charts)).toContain('mobile:grid-cols-1');
    const tile = leaf(host, en.analytics_metric_followers)!;
    expect(charts!.contains(tile)).toBe(false);
    expect(
      tile.compareDocumentPosition(charts!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});

// With no data at all the channel needs reconnecting, and the state offers
// the channel list's Reconnect rather than a copy of its own (R4).
describe('a channel with no data at all', () => {
  beforeEach(() => {
    mockReconnect.mockReturnValue(mockRunReconnect);
  });

  it('keeps the "needs to be refreshed" state, and reconnects through useReconnectChannel', async () => {
    const host = await render([]);

    expect(host.textContent).toContain(
      'This channel needs to be refreshed to display analytics'
    );
    expect(host.querySelector('figure')).toBeNull();
    const buttons = host.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    await act(async () => {
      (buttons[0] as HTMLElement).click();
    });

    expect(mockReconnect).toHaveBeenCalledWith(channel);
    expect(mockRunReconnect).toHaveBeenCalledTimes(1);
    // the analytics read, and no fetch of the page's own
    expect(request).toHaveBeenCalledTimes(1);
  });

  // FR-052 and SC-007: 44px on a touch screen, and a ring on keyboard focus,
  // which global.scss's outline: none leaves to a class (M22)
  it('sizes its Reconnect 44px tall on touch, with the focus ring', async () => {
    const host = await render([]);

    expect(classes(host.querySelector('button'))).toEqual(
      expect.arrayContaining([
        'coarse:min-h-[44px]',
        'focus-visible:ring-2',
        'focus-visible:ring-brand',
      ])
    );
  });

  // a plain button, never a form's submit, as the panel's buttons are
  it('makes its Reconnect a button of type "button"', async () => {
    const host = await render([]);

    expect(host.querySelector('button')!.getAttribute('type')).toBe('button');
  });
});

// A failed answer isn't numbers. A 502 while the backend restarts comes back
// with a JSON body, an object, which the page once took for its list and broke
// on (Sentry 159718423, after the 206 Redeploy): it's an error SWR asks again
// for, and the numbers show once an answer comes.
describe('a failed answer', () => {
  const failed = {
    ok: false,
    status: 502,
    json: async () => ({ statusCode: 502, message: 'Bad Gateway' }),
  };
  const draw = async (config: Record<string, number> = {}) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    await act(async () => {
      root.render(
        <SWRConfig
          value={{ provider: () => new Map(), dedupingInterval: 0, ...config }}
        >
          <RenderAnalytics integration={channel} date={7} />
        </SWRConfig>
      );
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    return host;
  };

  it('draws no tile, chart or "needs to be refreshed", and throws nothing', async () => {
    request.mockResolvedValue(failed);
    const host = await draw();

    expect(request).toHaveBeenCalledWith('/analytics/ch1?date=7');
    expect(host.querySelector('figure')).toBeNull();
    expect(host.textContent).not.toContain(
      'This channel needs to be refreshed to display analytics'
    );
  });

  it('is asked again, and the numbers show once an answer comes', async () => {
    request.mockResolvedValueOnce(failed).mockResolvedValue({
      ok: true,
      json: async () => [metric('Reach', [1, 2, 3])],
    });
    const host = await draw({ errorRetryInterval: 1 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(request).toHaveBeenCalledTimes(2);
    expect(host.querySelector('figure')).not.toBeNull();
  });
});

// The page draws RenderAnalytics anew for each channel and period, by its key,
// and SWR keeps each one's numbers under its own key. So a channel shows its
// own numbers or its own loading, never another's: from the cache on a quick
// switch back, which SWR doesn't ask again within its 2s dedupe interval, and
// past that interval fetched again on mount, its cached numbers kept on screen
// meanwhile. A period is a key of its own too, so the channel's numbers for
// another period are never shown as this one's.
describe('switching channels and periods', () => {
  const IG = '/analytics/ig?date=7';
  const AF = '/analytics/af?date=7';
  // The requests not yet answered, which a case answers in its own order.
  const pending: Array<{ url: string; answer: (items: unknown[]) => void }> =
    [];

  beforeEach(() => {
    request.mockImplementation(
      (url: string) =>
        new Promise((resolve) =>
          pending.push({
            url,
            answer: (items) => resolve({ ok: true, json: async () => items }),
          })
        )
    );
  });
  afterEach(() => {
    pending.length = 0;
  });

  // RenderAnalytics in one SWR cache, drawn for a channel over 7 days, or the
  // period given, with the page's key, or without it as the same component.
  const page = (dedupingInterval?: number) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted.push(root);
    const cache = new Map();
    const config = dedupingInterval === undefined ? {} : { dedupingInterval };
    const show = async (id: string, keyed = true, date = 7) => {
      await act(async () => {
        root.render(
          <SWRConfig value={{ provider: () => cache, ...config }}>
            <RenderAnalytics
              key={keyed ? `${id}-${date}` : undefined}
              integration={{ id } as Integration}
              date={date}
            />
          </SWRConfig>
        );
      });
    };
    return { host, show };
  };
  const wait = (ms: number) =>
    act(() => new Promise((resolve) => setTimeout(resolve, ms)));
  const answer = async (url: string, totals: number[]) => {
    const index = pending.findIndex((request) => request.url === url);
    expect(index).toBeGreaterThan(-1);
    const [{ answer: reply }] = pending.splice(index, 1);
    await act(async () => {
      reply([metric('Reach', totals)]);
    });
    await wait(0);
  };
  // The chart's headline, or null with no chart drawn.
  const headline = (host: Element) => {
    const figure = host.querySelector('figure');
    return figure
      ? Array.from(figure.querySelectorAll('span')).find((span) =>
          classes(span).includes('text-[26px]')
        )!.textContent
      : null;
  };
  // LoadingComponent's spinner.
  const spinning = (host: Element) =>
    Array.from(host.querySelectorAll('div')).some((el) =>
      (el.getAttribute('style') ?? '').includes('spin')
    );

  it('shows a channel switched back to within the interval from its cache at once, with no spinner left', async () => {
    const { host, show } = page();
    await show('ig');
    await answer(IG, [1, 2, 3]);
    await show('af');
    await answer(AF, [10, 20, 30]);
    expect(headline(host)).toBe('60');

    await show('ig');
    await wait(20);

    expect(headline(host)).toBe('6');
    expect(spinning(host)).toBe(false);
    // asked once each
    expect(request.mock.calls.map(([url]) => url)).toEqual([IG, AF]);
  });

  it("fetches a period switched to within the interval, and shows its numbers, not the other period's", async () => {
    const IG_30 = '/analytics/ig?date=30';
    const { host, show } = page();
    await show('ig');
    await answer(IG, [1, 2, 3]);
    expect(headline(host)).toBe('6');

    await show('ig', true, 30);
    await wait(20);

    expect(request.mock.calls.map(([url]) => url)).toEqual([IG, IG_30]);
    expect(headline(host)).toBeNull();
    expect(spinning(host)).toBe(true);

    await answer(IG_30, [10, 20, 30]);
    expect(headline(host)).toBe('60');
    expect(host.textContent).toContain('Total for the last 30 days');
  });

  it('fetches a channel switched back to past the interval again on mount, keeping its numbers on screen meanwhile', async () => {
    // the interval gone by at once
    const { host, show } = page(0);
    await show('ig');
    await answer(IG, [1, 2, 3]);
    await show('af');
    await answer(AF, [10, 20, 30]);

    await show('ig');
    // SWR asks again for a cached key on the next frame
    await wait(20);

    expect(request.mock.calls.map(([url]) => url)).toEqual([IG, AF, IG]);
    expect(headline(host)).toBe('6');
    expect(spinning(host)).toBe(false);

    await answer(IG, [2, 3, 4]);
    expect(headline(host)).toBe('9');
  });

  it("keeps a channel's spinner when another channel's slower answer comes in, even drawn as the same component", async () => {
    const { host, show } = page();
    await show('ig', false);
    await show('af', false);

    // Instagram answers after the switch
    await answer(IG, [1, 2, 3]);
    expect(spinning(host)).toBe(true);
    expect(headline(host)).toBeNull();

    await answer(AF, [10, 20, 30]);
    expect(spinning(host)).toBe(false);
    expect(headline(host)).toBe('60');
  });
});
