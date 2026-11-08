// Guards the names of the Analytics cards (spec 051). Each provider returns its
// metric's name in English, and metricLabel reads it through an
// analytics_metric_<slug> key, so a key missing from a language shows the
// provider's English there. The en and ar names are the contract's
// (contracts/analytics-metrics.md), and every offered language carries each key,
// because keys in en and ar alone would drop the other six to English.
import * as fs from 'fs';
import * as path from 'path';
import { languages } from '@gitroom/react/translation/i18n.config';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

// [slug, en, ar]
const METRICS = [
  ['page_impressions', 'Media reach', 'وصول الوسائط'],
  ['posts_engagement', 'Post engagement', 'التفاعل مع المنشورات'],
  ['page_followers', 'New followers', 'متابعون جدد'],
  ['media_views', 'Media views', 'مشاهدات الوسائط'],
  ['follower_count', 'New followers', 'متابعون جدد'],
  ['followers', 'Followers', 'المتابعون'],
  ['reach', 'Reach', 'الوصول'],
  ['views', 'Views', 'المشاهدات'],
  ['likes', 'Likes', 'الإعجابات'],
  ['comments', 'Comments', 'التعليقات'],
  ['shares', 'Shares', 'المشاركات'],
  ['saves', 'Saves', 'مرات الحفظ'],
  ['replies', 'Replies', 'الردود'],
  ['page_views', 'Page views', 'مشاهدات الصفحة'],
  ['clicks', 'Clicks', 'النقرات'],
  ['engagement', 'Engagement', 'التفاعل'],
  [
    'organic_followers',
    'New followers, not from ads',
    'متابعون جدد من غير الإعلانات',
  ],
  ['paid_followers', 'New followers from ads', 'متابعون جدد من الإعلانات'],
  ['reposts', 'Reposts', 'إعادات النشر'],
  ['quotes', 'Quotes', 'الاقتباسات'],
  ['impression', 'Impressions', 'مرات الظهور'],
  ['bookmark', 'Bookmarks', 'العلامات المرجعية'],
  ['like', 'Likes', 'الإعجابات'],
  ['quote', 'Quotes', 'الاقتباسات'],
  ['reply', 'Replies', 'الردود'],
  ['retweet', 'Reposts', 'إعادات النشر'],
  ['impressions', 'Impressions', 'مرات الظهور'],
  ['pin_clicks', 'Pin clicks', 'نقرات الدبابيس'],
  ['pin_click_rate', 'Pin click rate', 'معدل النقر على الدبابيس'],
  ['following', 'Following', 'الحسابات المتابعة'],
  ['recent_comments', 'Recent comments', 'التعليقات الأخيرة'],
  ['recent_likes', 'Recent likes', 'الإعجابات الأخيرة'],
  ['recent_shares', 'Recent shares', 'المشاركات الأخيرة'],
  ['total_likes', 'Total likes', 'إجمالي الإعجابات'],
  ['videos', 'Videos', 'الفيديوهات'],
  ['estimated_minutes_watched', 'Minutes watched', 'دقائق المشاهدة'],
  ['average_view_duration', 'Average view duration', 'متوسط مدة المشاهدة'],
  [
    'average_view_percentage',
    'Average percentage viewed',
    'متوسط نسبة المشاهدة',
  ],
  ['subscribers_gained', 'Subscribers gained', 'المشتركون الجدد'],
  ['subscribers_lost', 'Subscribers lost', 'إلغاءات الاشتراك'],
  ['website_clicks', 'Website clicks', 'نقرات الموقع'],
  ['phone_calls', 'Phone calls', 'المكالمات الهاتفية'],
  ['direction_requests', 'Direction requests', 'طلبات الاتجاهات'],
  [
    'desktop_map_views',
    'Map views on desktop',
    'مشاهدات الخريطة على الكمبيوتر',
  ],
  ['mobile_map_views', 'Map views on mobile', 'مشاهدات الخريطة على الجوال'],
] as const;

// These count new follows per day, not the follower total. The wording of the
// other names is reviewed in a walk; this is decided, so it is pinned apart.
const FOLLOWER_GAINS = [
  'page_followers',
  'follower_count',
  'organic_followers',
  'paid_followers',
];

const key = (slug: string) => `analytics_metric_${slug}`;

describe('analytics metric locale keys', () => {
  const locales = Object.fromEntries(
    languages.map((lng) => [lng, readLocale(lng)])
  );

  it('lists the 45 metrics of the contract, each once', () => {
    expect(new Set(METRICS.map(([slug]) => slug)).size).toBe(45);
  });

  // A name never takes a value, so braces would render as they are.
  it.each(
    languages.flatMap((lng) => METRICS.map(([slug]) => [lng, key(slug)]))
  )('has %s.%s, with no placeholder', (lng, name) => {
    expect(typeof locales[lng][name]).toBe('string');
    expect(locales[lng][name].length).toBeGreaterThan(0);
    expect(locales[lng][name]).not.toContain('{{');
  });

  it.each(METRICS)('names %s "%s" in en and "%s" in ar', (slug, en, ar) => {
    expect(locales.en[key(slug)]).toBe(en);
    expect(locales.ar[key(slug)]).toBe(ar);
  });

  it.each(FOLLOWER_GAINS)('reads %s as new followers', (slug) => {
    expect(locales.en[key(slug)]).toMatch(/^New followers\b/);
    expect(locales.ar[key(slug)]).toMatch(/^متابعون جدد/);
  });
});
