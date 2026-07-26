// Guards the plan feature list shared by the billing page, the post-signup plan
// picker and the lifetime-deal comparison: the row order, the per-plan gating,
// and — the point of the exercise — that every rendered string matches the
// marketing pricing page (sharek.app/pricing) word for word in en and ar.
//
// The Arabic assertions double as a regression test for counted nouns: Arabic
// takes a plural after 3-10 but a singular after 11, which only comes out right
// because the keys carry i18next's CLDR plural suffixes.
import * as fs from 'fs';
import * as path from 'path';
import i18next from 'i18next';
import { billingFeatures } from '../../../../apps/frontend/src/components/billing/billing.features';
import { pricing } from '../../../nestjs-libraries/src/database/prisma/subscriptions/pricing';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  );

const en = readLocale('en');
const ar = readLocale('ar');

// Transcribed from sharek-marketing/src/content/pricing/{en,ar}/-index.md.
const EXPECTED_EN: Record<string, string[]> = {
  STANDARD: [
    '10 channels',
    '250 posts per month',
    '50 AI images per month',
    '5 AI videos per month',
    'AI assistant',
    'Samy AI agent',
    'Image editor',
  ],
  TEAM: [
    '25 channels',
    '1,000 posts per month',
    '150 AI images per month',
    '15 AI videos per month',
    'AI assistant',
    'Samy AI agent',
    'Image editor',
    'Unlimited team members',
  ],
  PRO: [
    '50 channels',
    'Unlimited posts',
    '250 AI images per month',
    '25 AI videos per month',
    'AI assistant',
    'Samy AI agent',
    'Image editor',
    'Unlimited team members',
  ],
  ULTIMATE: [
    '200 channels',
    'Unlimited posts',
    '1,000 AI images per month',
    '100 AI videos per month',
    'AI assistant',
    'Samy AI agent',
    'Image editor',
    'Unlimited team members',
    'Priority support with SLA',
    'Early access to new features',
  ],
};

const EXPECTED_AR: Record<string, string[]> = {
  STANDARD: [
    '10 قنوات',
    '250 منشورًا شهريًا',
    '50 صورة بالذكاء الاصطناعي شهريًا',
    '5 فيديوهات بالذكاء الاصطناعي شهريًا',
    'مساعد الذكاء الاصطناعي',
    'سامي، الوكيل الذكي',
    'محرّر الصور',
  ],
  TEAM: [
    '25 قناة',
    '1,000 منشور شهريًا',
    '150 صورة بالذكاء الاصطناعي شهريًا',
    '15 فيديو بالذكاء الاصطناعي شهريًا',
    'مساعد الذكاء الاصطناعي',
    'سامي، الوكيل الذكي',
    'محرّر الصور',
    'أعضاء فريق بلا حدود',
  ],
  PRO: [
    '50 قناة',
    'منشورات بلا حدود',
    '250 صورة بالذكاء الاصطناعي شهريًا',
    '25 فيديو بالذكاء الاصطناعي شهريًا',
    'مساعد الذكاء الاصطناعي',
    'سامي، الوكيل الذكي',
    'محرّر الصور',
    'أعضاء فريق بلا حدود',
  ],
  ULTIMATE: [
    '200 قناة',
    'منشورات بلا حدود',
    '1,000 صورة بالذكاء الاصطناعي شهريًا',
    '100 فيديو بالذكاء الاصطناعي شهريًا',
    'مساعد الذكاء الاصطناعي',
    'سامي، الوكيل الذكي',
    'محرّر الصور',
    'أعضاء فريق بلا حدود',
    'دعم بأولوية مع اتفاقية SLA',
    'وصول مبكر إلى الميزات الجديدة',
  ],
};

const PAID = ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'];
const RETIRED = [
  'billing_ai_auto_complete',
  'billing_ai_autocomplete',
  'billing_ai_copilots',
  'billing_advanced_picture_editor',
  'billing_channel',
  'billing_channels',
  'billing_posts_per_month',
  'billing_unlimited',
  'billing_ai_images_per_month',
  'billing_ai_videos_per_month',
];

// The components call t(key, defaultValue, feature); mirror that exactly.
const render = (tier: string) =>
  billingFeatures(pricing[tier]).map((feature) =>
    i18next.t(feature.key, feature.defaultValue, feature as any)
  );

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: ['en', 'ar'],
    resources: { en: { translation: en }, ar: { translation: ar } },
    initImmediate: false,
  });
});

describe('billing feature list', () => {
  it('orders rows channels → posts → images → videos → assistant → Samy → editor → team', () => {
    expect(billingFeatures(pricing.TEAM).map((f) => f.key)).toEqual([
      'billing_channels',
      'billing_posts_per_month',
      'billing_ai_images_per_month',
      'billing_ai_videos_per_month',
      'billing_ai_assistant',
      'billing_samy_ai_agent',
      'billing_image_editor',
      'billing_unlimited_team_members',
    ]);
  });

  it('shows the AI image allowance on Standard, whose image_generator flag is false', () => {
    expect(pricing.STANDARD.image_generator).toBe(false);
    expect(pricing.STANDARD.image_generation_count).toBe(50);
    expect(billingFeatures(pricing.STANDARD)).toContainEqual(
      expect.objectContaining({ key: 'billing_ai_images_per_month', count: 50 })
    );
  });

  it('adds the premium rows to Ultimate only', () => {
    const premium = ['billing_priority_support_sla', 'billing_early_access'];
    expect(billingFeatures(pricing.ULTIMATE).map((f) => f.key)).toEqual(
      expect.arrayContaining(premium)
    );
    for (const tier of ['STANDARD', 'TEAM', 'PRO']) {
      const keys = billingFeatures(pricing[tier]).map((f) => f.key);
      premium.forEach((k) => expect(keys).not.toContain(k));
    }
  });

  it('lists no feature the free plan does not have', () => {
    expect(billingFeatures(pricing.FREE).map((f) => f.key)).toEqual([
      'billing_channels',
      'billing_posts_per_month',
      'billing_image_editor',
    ]);
  });

  describe.each(PAID)('%s', (tier) => {
    it('renders the marketing English copy', async () => {
      await i18next.changeLanguage('en');
      expect(render(tier)).toEqual(EXPECTED_EN[tier]);
    });

    it('renders the marketing Arabic copy', async () => {
      await i18next.changeLanguage('ar');
      expect(render(tier)).toEqual(EXPECTED_AR[tier]);
    });
  });
});

describe('billing feature locale keys', () => {
  const emitted = [
    ...new Set(PAID.flatMap((t) => billingFeatures(pricing[t]).map((f) => f.key))),
  ];

  it('resolves every emitted key in en and ar', () => {
    for (const key of emitted) {
      // Counted rows live under CLDR suffixes, plain rows under the bare key.
      const has = (locale: Record<string, string>, suffixes: string[]) =>
        key in locale || suffixes.every((s) => `${key}_${s}` in locale);
      expect({ key, en: has(en, ['one', 'other']) }).toEqual({ key, en: true });
      expect({
        key,
        ar: has(ar, ['zero', 'one', 'two', 'few', 'many', 'other']),
      }).toEqual({ key, ar: true });
    }
  });

  it('drops the retired keys from en and ar', () => {
    for (const key of RETIRED) {
      expect({ key, en: key in en }).toEqual({ key, en: false });
      expect({ key, ar: key in ar }).toEqual({ key, ar: false });
    }
  });
});
