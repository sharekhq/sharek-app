// Pure functions — nothing is rendered here. The `.tsx` extension is only
// because apps/frontend/jest.config.ts matches `**/*.spec.tsx`.
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  LIMIT_FALLBACK,
  LIMIT_SECTIONS,
  formatResetDate,
  limitCopyFor,
  limitSectionFor,
  nextTierFor,
  viewerCanBuy,
} from '@gitroom/frontend/components/billing/limit.sections';

// Every section a @CheckPolicies or a MediaService throw can reach as a 402
// (research R1). None of them may land on an empty card.
const REACHABLE = [
  'images_per_month',
  'videos_per_month',
  'posts_per_month',
  'channel',
  'webhooks',
  'ai',
  'team_members',
  'admin',
];

describe('the section table', () => {
  it.each(REACHABLE)('resolves %s to an entry', (section) => {
    expect(limitSectionFor(section)).toBeDefined();
    expect(LIMIT_SECTIONS[section]).toBeDefined();
  });

  it.each(['community_features', '', undefined])(
    'falls back for %s rather than resolving to nothing',
    (section) => {
      expect(limitSectionFor(section)).toBe(LIMIT_FALLBACK);
    }
  );

  // A reset sentence follows from the shape alone, so a section cannot acquire
  // or lose one by being special-cased in the component.
  it('gives a reset pair to the allowance sections and to no others', () => {
    const withReset = Object.entries(LIMIT_SECTIONS)
      .filter(([, entry]) => entry.shape === 'allowance')
      .map(([section]) => section);

    expect(withReset.sort()).toEqual(
      ['images_per_month', 'posts_per_month', 'videos_per_month'].sort()
    );
  });

  it('defaults the reset pair to credits and overrides it for posts', () => {
    expect(LIMIT_SECTIONS.images_per_month.reset.dated.key).toBe(
      'limit_reset_credits_dated'
    );
    expect(LIMIT_SECTIONS.videos_per_month.reset.generic.key).toBe(
      'limit_reset_credits_generic'
    );
    // Posts are not credits.
    expect(LIMIT_SECTIONS.posts_per_month.reset.dated.key).toBe(
      'limit_reset_posts_dated'
    );
    expect(LIMIT_SECTIONS.posts_per_month.reset.generic.key).toBe(
      'limit_reset_posts_generic'
    );
  });

  it('treats admin as a permission, not a plan matter', () => {
    expect(LIMIT_SECTIONS.admin.shape).toBe('permission');
  });
});

describe('the copy a section resolves to', () => {
  it('names the figure the plan actually carries', () => {
    const copy = limitCopyFor(LIMIT_SECTIONS.videos_per_month, pricing.STANDARD);

    expect(copy.count).toBe(pricing.STANDARD.generate_videos);
    expect(copy.title.key).toBe('limit_videos_per_month_title');
    expect(copy.generic).toBe(false);
  });

  // "You've used all 0 AI images" is false; the Free plan simply does not
  // include them.
  it('switches to the zero copy when the plan includes none', () => {
    const copy = limitCopyFor(LIMIT_SECTIONS.images_per_month, pricing.FREE);

    expect(copy.count).toBe(0);
    expect(copy.title.key).toBe('limit_images_per_month_zero_title');
    expect(copy.body.key).toBe('limit_images_per_month_zero_body');
  });

  it('keeps the permission copy when the plan is unknown', () => {
    const copy = limitCopyFor(LIMIT_SECTIONS.admin, undefined);

    expect(copy.title.key).toBe('limit_admin_title');
    expect(copy.generic).toBe(false);
  });

  // Every other sentence names the plan or a figure from it, so without a tier
  // there is nothing truthful to say beyond the generic line.
  it('goes generic for every other shape when the plan is unknown', () => {
    const copy = limitCopyFor(LIMIT_SECTIONS.channel, undefined);

    expect(copy.generic).toBe(true);
    expect(copy.body.key).toBe(LIMIT_FALLBACK.body.key);
    expect(copy.count).toBeNull();
  });

  it('marks the fallback generic, so the 402 message can speak instead', () => {
    expect(limitCopyFor(LIMIT_FALLBACK, pricing.STANDARD).generic).toBe(true);
  });
});

describe('the next tier', () => {
  it('takes the first plan that is strictly better for the section hit', () => {
    // TEAM is the first plan above STANDARD with more videos.
    expect(nextTierFor('videos_per_month', pricing.STANDARD)?.plan.current).toBe(
      'TEAM'
    );
  });

  it('skips a plan that matches the current figure rather than beating it', () => {
    // PRO and ULTIMATE both carry 1,000,000 posts, so from PRO there is no
    // better plan for posts even though ULTIMATE is above it.
    expect(nextTierFor('posts_per_month', pricing.PRO)).toBeNull();
  });

  it('finds the first plan that includes a feature the current one lacks', () => {
    expect(nextTierFor('team_members', pricing.STANDARD)?.plan.current).toBe(
      'TEAM'
    );
  });

  it('returns nothing at the top tier', () => {
    expect(nextTierFor('videos_per_month', pricing.ULTIMATE)).toBeNull();
  });

  it('never offers an upgrade for a permission', () => {
    expect(nextTierFor('admin', pricing.FREE)).toBeNull();
  });

  it('never offers an upgrade for an unknown section', () => {
    expect(nextTierFor('community_features', pricing.FREE)).toBeNull();
  });

  it('claims nothing when the current tier is unknown', () => {
    expect(nextTierFor('videos_per_month', undefined)).toBeNull();
  });

  it('leads with the section that was hit', () => {
    const rows = nextTierFor('videos_per_month', pricing.STANDARD)!.rows;

    expect(rows[0].key).toBe('billing_ai_videos_per_month');
    expect(rows.map((row) => row.key)).toContain('billing_ai_images_per_month');
  });

  // The billing page renders 1,000,000 posts as "Unlimited posts"; the modal
  // must not contradict it with the raw figure.
  it('renders an unbounded post count as unlimited', () => {
    const rows = nextTierFor('posts_per_month', pricing.TEAM)!.rows;

    expect(rows[0].key).toBe('billing_unlimited_posts');
    expect(JSON.stringify(rows)).not.toContain('1,000,000');
  });
});

describe('who may act on the upsell', () => {
  it.each(['ADMIN', 'SUPERADMIN'])('lets %s buy', (role) => {
    expect(viewerCanBuy(role)).toBe(true);
  });

  // Billing is hidden from a USER's nav and its routes refuse them, so an
  // upgrade button would open a tab that turns them away on arrival.
  it.each(['USER', 'GUEST', undefined])('does not let %s buy', (role) => {
    expect(viewerCanBuy(role)).toBe(false);
  });
});

describe('the reset date', () => {
  const iso = '2026-09-12T08:31:04.000Z';

  it('reads as a day and a month in English', () => {
    expect(formatResetDate(iso, 'en')).toContain('September');
  });

  it('reads as an Arabic month with Latin digits', () => {
    const formatted = formatResetDate(iso, 'ar');

    expect(formatted).toContain('12');
    // Arabic-Indic digits are against the product's convention...
    expect(formatted).not.toMatch(/[٠-٩]/);
    // ...and an English month name means the locale never took.
    expect(formatted).not.toContain('September');
  });
});
