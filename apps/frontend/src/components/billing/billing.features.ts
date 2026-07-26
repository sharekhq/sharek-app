import type { PricingInnerInterface } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

// One list for three surfaces — the billing page, the post-signup plan picker and
// the lifetime-deal comparison all render these rows. Wording and order follow the
// marketing pricing page (sharek.app/pricing) so the site and the app agree.
// A type alias, not an interface: the whole object is handed to i18next as the
// options bag, and only aliases pick up the implicit index signature that
// i18next's `$Dictionary` requires.
export type BillingFeature = {
  key: string;
  defaultValue: string;
  // `count` picks the plural form (Arabic takes a plural after 3-10 but a
  // singular after 11); `value` is the number as rendered — grouped Latin
  // digits in every language, as on the marketing page.
  count?: number;
  value?: string;
};

const counted = (
  key: string,
  defaultValue: string,
  count: number
): BillingFeature => ({
  key,
  defaultValue,
  count,
  value: count.toLocaleString('en-US'),
});

export const billingFeatures = (
  plan: PricingInnerInterface
): BillingFeature[] => {
  const list: BillingFeature[] = [
    counted('billing_channels', '{{value}} channels', plan.channel || 0),
    plan.posts_per_month > 10000
      ? { key: 'billing_unlimited_posts', defaultValue: 'Unlimited posts' }
      : counted(
          'billing_posts_per_month',
          '{{value}} posts per month',
          plan.posts_per_month
        ),
  ];

  // Gated on the allowance itself: `image_generator` is false on Standard even
  // though the plan does include 50 images a month.
  if (plan.image_generation_count > 0) {
    list.push(
      counted(
        'billing_ai_images_per_month',
        '{{value}} AI images per month',
        plan.image_generation_count
      )
    );
  }

  if (plan.generate_videos > 0) {
    list.push(
      counted(
        'billing_ai_videos_per_month',
        '{{value}} AI videos per month',
        plan.generate_videos
      )
    );
  }

  if (plan.ai) {
    list.push({ key: 'billing_ai_assistant', defaultValue: 'AI assistant' });
    list.push({ key: 'billing_samy_ai_agent', defaultValue: 'Samy AI agent' });
  }

  list.push({ key: 'billing_image_editor', defaultValue: 'Image editor' });

  if (plan.team_members) {
    list.push({
      key: 'billing_unlimited_team_members',
      defaultValue: 'Unlimited team members',
    });
  }

  if (plan.current === 'ULTIMATE') {
    list.push({
      key: 'billing_priority_support_sla',
      defaultValue: 'Priority support with SLA',
    });
    list.push({
      key: 'billing_early_access',
      defaultValue: 'Early access to new features',
    });
  }

  return list;
};
