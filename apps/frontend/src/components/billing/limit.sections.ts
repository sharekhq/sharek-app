import {
  pricing,
  PricingInnerInterface,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  BillingFeature,
  billingFeatureFor,
} from '@gitroom/frontend/components/billing/billing.features';

/**
 * The limit modal's entire knowledge of "which limit is this". Data, not
 * branches: the component reads an entry and renders it, so a section cannot
 * work only because it was special-cased.
 *
 * The section arrives as a string on the 402 body rather than as the backend's
 * `Sections` enum — the browser must survive a value this table has never heard
 * of, which is what the fallback entry is for.
 */
export type LimitShape = 'allowance' | 'cap' | 'feature' | 'permission';

export interface LimitCopy {
  key: string;
  defaultValue: string;
}

export interface LimitSection {
  /**
   * Selects the body sentence, whether a reset line appears (`allowance` only)
   * and whether an upsell may appear (never for `permission`).
   */
  shape: LimitShape;
  title: LimitCopy;
  body: LimitCopy;
  /** Used instead when the current plan's figure is 0 — see `limitCopyFor`. */
  zeroTitle?: LimitCopy;
  zeroBody?: LimitCopy;
  /** The plan's figure for this section; null where the section has no number. */
  allowanceOf: (plan: PricingInnerInterface) => number | null;
  /** Whether a plan includes this at all. Only the `feature` shapes declare it. */
  includedIn?: (plan: PricingInnerInterface) => boolean;
  /** Next-tier rows, in order, leading with the section that was hit. */
  rows: string[];
  /** The reset sentence pair; read only when `shape === 'allowance'`. */
  reset: { dated: LimitCopy; generic: LimitCopy };
  /** Adds the spark to the illustration — declared, so the card never has to
   * ask which section it is drawing. */
  spark?: boolean;
}

// The pools are credits everywhere the customer sees them — this modal's
// headline, the AI modals' header pill, Samy's refusals. Posts get their own
// pair because posts are not credits, and complete sentences per pair because a
// shared frame with a swapped subject noun does not survive Arabic agreement.
const CREDITS_RESET = {
  dated: {
    key: 'limit_reset_credits_dated',
    defaultValue: 'Your credits reset on {{date}}.',
  },
  generic: {
    key: 'limit_reset_credits_generic',
    defaultValue: 'Your credits reset each billing month.',
  },
};

const POSTS_RESET = {
  dated: {
    key: 'limit_reset_posts_dated',
    defaultValue: 'Your monthly limit resets on {{date}}.',
  },
  generic: {
    key: 'limit_reset_posts_generic',
    defaultValue: 'Your monthly limit resets each billing month.',
  },
};

export const LIMIT_FALLBACK: LimitSection = {
  // No allowance and no flag, so `nextTierFor` resolves nothing and no upgrade
  // is offered — nothing is known about what would lift this limit.
  shape: 'feature',
  title: {
    key: 'limit_fallback_title',
    defaultValue: "You've reached a limit on your plan",
  },
  body: {
    key: 'limit_fallback_body',
    defaultValue: "This action isn't available on your current plan.",
  },
  allowanceOf: () => null,
  rows: [],
  reset: CREDITS_RESET,
};

export const LIMIT_SECTIONS: Record<string, LimitSection> = {
  videos_per_month: {
    shape: 'allowance',
    title: {
      key: 'limit_videos_per_month_title',
      defaultValue: "You're out of AI video credits",
    },
    body: {
      key: 'limit_videos_per_month_body',
      defaultValue:
        "You've used all {{count}} AI videos in your {{plan}} plan this month.",
    },
    zeroTitle: {
      key: 'limit_videos_per_month_zero_title',
      defaultValue: "AI videos aren't part of the {{plan}} plan",
    },
    zeroBody: {
      key: 'limit_videos_per_month_zero_body',
      defaultValue:
        'Upgrade to start creating videos for your posts, straight from the composer.',
    },
    allowanceOf: (plan) => plan.generate_videos,
    // The two AI pools improve together on every tier and are bought together.
    rows: ['videos_per_month', 'images_per_month'],
    reset: CREDITS_RESET,
    spark: true,
  },
  images_per_month: {
    shape: 'allowance',
    title: {
      key: 'limit_images_per_month_title',
      defaultValue: "You're out of AI image credits",
    },
    body: {
      key: 'limit_images_per_month_body',
      defaultValue:
        "You've used all {{count}} AI images in your {{plan}} plan this month.",
    },
    zeroTitle: {
      key: 'limit_images_per_month_zero_title',
      defaultValue: "AI images aren't part of the {{plan}} plan",
    },
    zeroBody: {
      key: 'limit_images_per_month_zero_body',
      defaultValue:
        'Upgrade to start generating images for your posts, straight from the composer.',
    },
    allowanceOf: (plan) => plan.image_generation_count,
    rows: ['images_per_month', 'videos_per_month'],
    reset: CREDITS_RESET,
    spark: true,
  },
  posts_per_month: {
    shape: 'allowance',
    title: {
      key: 'limit_posts_per_month_title',
      defaultValue: "You've reached your monthly post limit",
    },
    body: {
      key: 'limit_posts_per_month_body',
      defaultValue:
        "You've used all {{count}} posts in your {{plan}} plan this month.",
    },
    zeroTitle: {
      key: 'limit_posts_per_month_zero_title',
      defaultValue: "Scheduling posts isn't part of the {{plan}} plan",
    },
    zeroBody: {
      key: 'limit_posts_per_month_zero_body',
      defaultValue: 'Upgrade to start scheduling posts to your channels.',
    },
    allowanceOf: (plan) => plan.posts_per_month,
    rows: ['posts_per_month'],
    reset: POSTS_RESET,
  },
  channel: {
    shape: 'cap',
    title: {
      key: 'limit_channel_title',
      defaultValue: "You've reached your channel limit",
    },
    body: {
      key: 'limit_channel_body',
      defaultValue:
        'Your {{plan}} plan connects up to {{count}} channels. Upgrade to add more.',
    },
    zeroTitle: {
      key: 'limit_channel_zero_title',
      defaultValue: "Connecting channels isn't part of the {{plan}} plan",
    },
    zeroBody: {
      key: 'limit_channel_zero_body',
      defaultValue:
        'Upgrade to connect your social accounts and start scheduling.',
    },
    allowanceOf: (plan) => plan.channel || 0,
    rows: ['channel'],
    reset: CREDITS_RESET,
  },
  webhooks: {
    shape: 'cap',
    title: {
      key: 'limit_webhooks_title',
      defaultValue: "You've reached your webhook limit",
    },
    body: {
      key: 'limit_webhooks_body',
      defaultValue:
        'Your {{plan}} plan includes up to {{count}} webhooks. Upgrade to add more.',
    },
    zeroTitle: {
      key: 'limit_webhooks_zero_title',
      defaultValue: "Webhooks aren't part of the {{plan}} plan",
    },
    zeroBody: {
      key: 'limit_webhooks_zero_body',
      defaultValue:
        'Upgrade to send your posting events to your own endpoints.',
    },
    allowanceOf: (plan) => plan.webhooks,
    rows: ['webhooks'],
    reset: CREDITS_RESET,
  },
  ai: {
    shape: 'feature',
    title: {
      key: 'limit_ai_title',
      defaultValue: "The AI assistant isn't part of the {{plan}} plan",
    },
    body: {
      key: 'limit_ai_body',
      defaultValue:
        'Upgrade to write, rewrite and plan your posts with the assistant.',
    },
    allowanceOf: () => null,
    includedIn: (plan) => plan.ai,
    rows: ['ai'],
    reset: CREDITS_RESET,
    spark: true,
  },
  team_members: {
    shape: 'feature',
    title: {
      key: 'limit_team_members_title',
      defaultValue: "Team members aren't part of the {{plan}} plan",
    },
    body: {
      key: 'limit_team_members_body',
      defaultValue: 'Upgrade to invite your team and share the workspace.',
    },
    allowanceOf: () => null,
    includedIn: (plan) => plan.team_members,
    rows: ['team_members'],
    reset: CREDITS_RESET,
  },
  admin: {
    // Role-gated, not plan-gated (`permissions.service.ts:130`), so offering an
    // upgrade here would state something untrue.
    shape: 'permission',
    title: {
      key: 'limit_admin_title',
      defaultValue: "You don't have permission for this",
    },
    body: {
      key: 'limit_admin_body',
      defaultValue:
        'Ask an account owner or admin to do this, or to change your role.',
    },
    allowanceOf: () => null,
    rows: [],
    reset: CREDITS_RESET,
  },
};

export const limitSectionFor = (section?: string): LimitSection =>
  LIMIT_SECTIONS[section ?? ''] ?? LIMIT_FALLBACK;

export interface LimitCopyResolution {
  title: LimitCopy;
  body: LimitCopy;
  /** The current plan's figure for this section, for `{{count}}`. */
  count: number | null;
  /** The body is the generic line, so the 402's own message may speak instead. */
  generic: boolean;
}

/**
 * Which sentences this refusal gets. Two rules, both derived from the shape
 * rather than from the section:
 *
 * - a figure of 0 takes the `zero*` copy, so the Free plan reads "AI images
 *   aren't part of the Free plan" instead of "you've used all 0";
 * - without a current plan there is no truthful way to name one, so everything
 *   but the permission copy degrades to the generic line.
 */
export const limitCopyFor = (
  entry: LimitSection,
  currentTier?: PricingInnerInterface
): LimitCopyResolution => {
  const generic: LimitCopyResolution = {
    title: entry.title,
    body: LIMIT_FALLBACK.body,
    count: null,
    generic: true,
  };

  if (entry === LIMIT_FALLBACK) {
    return { ...generic, title: LIMIT_FALLBACK.title };
  }

  if (!currentTier) {
    return entry.shape === 'permission'
      ? { title: entry.title, body: entry.body, count: null, generic: false }
      : { ...generic, title: LIMIT_FALLBACK.title };
  }

  const count = entry.allowanceOf(currentTier);

  if (count === 0 && entry.zeroTitle && entry.zeroBody) {
    return {
      title: entry.zeroTitle,
      body: entry.zeroBody,
      count,
      generic: false,
    };
  }

  return { title: entry.title, body: entry.body, count, generic: false };
};

export interface NextTier {
  plan: PricingInnerInterface;
  rows: BillingFeature[];
}

/**
 * The first plan above the current one that would actually lift this limit,
 * walked in the pricing table's declaration order. `null` at the top tier, for
 * a permission, and whenever the current tier is unreadable — better to offer
 * nothing than to send someone to a plan that changes nothing for them.
 */
export const nextTierFor = (
  section?: string,
  currentTier?: PricingInnerInterface
): NextTier | null => {
  const entry = limitSectionFor(section);

  if (entry.shape === 'permission' || !currentTier) {
    return null;
  }

  const tiers = Object.keys(pricing);
  const from = tiers.indexOf(currentTier.current);
  if (from === -1) {
    return null;
  }

  const better = (plan: PricingInnerInterface) => {
    if (entry.includedIn) {
      return entry.includedIn(plan) && !entry.includedIn(currentTier);
    }
    const now = entry.allowanceOf(currentTier);
    const next = entry.allowanceOf(plan);
    return now !== null && next !== null && next > now;
  };

  const plan = tiers
    .slice(from + 1)
    .map((tier) => pricing[tier])
    .find(better);

  if (!plan) {
    return null;
  }

  return {
    plan,
    rows: entry.rows
      .map((row) => billingFeatureFor(row, plan))
      .filter((row): row is BillingFeature => !!row),
  };
};

/**
 * The org creator is SUPERADMIN and invited members are USER or ADMIN. Billing
 * is hidden from a USER's nav and its two calls are ADMIN-gated, so an upgrade
 * button would open a tab that refuses them on arrival. An unknown role is
 * treated as unable to buy — better to under-offer than to send someone to a
 * dead end.
 */
export const viewerCanBuy = (role?: string) =>
  role === 'ADMIN' || role === 'SUPERADMIN';

/**
 * `-u-nu-latn` is load-bearing: plain `'ar'` yields Arabic-Indic digits (١٢),
 * against the product's Latin-digit convention. `Intl` rather than dayjs,
 * because `dayjs/locale/ar` is registered nowhere in this app and a dayjs format
 * would silently print English month names under Arabic.
 */
export const formatResetDate = (iso: string, lang: string) =>
  new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : lang, {
    day: 'numeric',
    month: 'long',
  });
