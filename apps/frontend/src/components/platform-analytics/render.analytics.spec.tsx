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

jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => request,
}));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback,
}));
// chart.js needs a canvas, which the test DOM doesn't have; what a card draws
// in it isn't under test.
jest.mock('@gitroom/frontend/components/analytics/chart-social', () => ({
  ChartSocial: () => null,
  CHART_CARD_HUES: ['pomegranate'],
  CHART_CARD_DOTS: ['bg-catPomegranate'],
}));

import i18next from 'i18next';
import { SWRConfig } from 'swr';
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

// The cards for one channel, with the analytics request answering `items`. A
// fresh SWR cache per render, so one case's answer never reaches the next.
const render = async (items: unknown[]) => {
  request.mockResolvedValue({ json: async () => items });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <RenderAnalytics integration={{ id: 'ch1' } as any} date={7} />
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

afterEach(async () => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
  request.mockReset();
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
