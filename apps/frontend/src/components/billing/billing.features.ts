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

/**
 * One row, for the section a refusal named. The limit modal lists what the next
 * tier gives through this, so it cannot state a figure the list below
 * contradicts — same keys, same `counted()`, same unlimited rule.
 */
export const billingFeatureFor = (
  section: string,
  plan: PricingInnerInterface
): BillingFeature | null => {
  switch (section) {
    case 'channel':
      return counted('billing_channels', '{{value}} channels', plan.channel || 0);
    case 'posts_per_month':
      return plan.posts_per_month > 10000
        ? { key: 'billing_unlimited_posts', defaultValue: 'Unlimited posts' }
        : counted(
            'billing_posts_per_month',
            '{{value}} posts per month',
            plan.posts_per_month
          );
    case 'images_per_month':
      return counted(
        'billing_ai_images_per_month',
        '{{value}} AI images per month',
        plan.image_generation_count
      );
    case 'videos_per_month':
      return counted(
        'billing_ai_videos_per_month',
        '{{value}} AI videos per month',
        plan.generate_videos
      );
    case 'webhooks':
      return counted('billing_webhooks', '{{value}} webhooks', plan.webhooks);
    case 'ai':
      return { key: 'billing_ai_assistant', defaultValue: 'AI assistant' };
    case 'team_members':
      return {
        key: 'billing_unlimited_team_members',
        defaultValue: 'Unlimited team members',
      };
    default:
      return null;
  }
};

export const billingFeatures = (
  plan: PricingInnerInterface
): BillingFeature[] => {
  const list: BillingFeature[] = [
    billingFeatureFor('channel', plan)!,
    billingFeatureFor('posts_per_month', plan)!,
  ];

  // Gated on the allowance itself: `image_generator` is false on Standard even
  // though the plan does include 50 images a month.
  if (plan.image_generation_count > 0) {
    list.push(billingFeatureFor('images_per_month', plan)!);
  }

  if (plan.generate_videos > 0) {
    list.push(billingFeatureFor('videos_per_month', plan)!);
  }

  if (plan.ai) {
    list.push(billingFeatureFor('ai', plan)!);
    list.push({ key: 'billing_samy_ai_agent', defaultValue: 'Samy AI agent' });
  }

  list.push({ key: 'billing_image_editor', defaultValue: 'Image editor' });

  if (plan.team_members) {
    list.push(billingFeatureFor('team_members', plan)!);
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
