// SubscriptionService's constructor deps drag in Prisma and the integration
// providers; none of that code runs here, so the modules are swapped for empty
// shells (same pattern as media.service.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository',
  () => ({ SubscriptionRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);

import dayjs from 'dayjs';
import { SubscriptionService } from './subscription.service';
import { pricing } from './pricing';

const makeService = (over: { totalUse?: number } = {}) => {
  const repository = {
    getCreditsFrom: jest.fn().mockResolvedValue(over.totalUse ?? 0),
  };
  const service = new SubscriptionService(
    repository as any,
    {} as any,
    {} as any
  );
  return { service, repository };
};

// Four months and three days back, so the next anniversary is a clear ~27 days
// away and cannot coincide with today whichever day the suite runs.
const createdAt = dayjs().subtract(4, 'month').subtract(3, 'day').toDate();

const org = (over: { tier?: string; createdAt?: Date } = {}) =>
  ({
    id: 'org-1',
    subscription: {
      subscriptionTier: over.tier ?? 'STANDARD',
      createdAt: over.createdAt ?? createdAt,
    },
  } as any);

describe('checkCredits', () => {
  it('returns the remaining image credits for the tier', async () => {
    const { service, repository } = makeService({ totalUse: 12 });

    const result = await service.checkCredits(org(), 'ai_images');

    expect(result.credits).toBe(pricing.STANDARD.image_generation_count - 12);
    expect(repository.getCreditsFrom).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'ai_images'
    );
  });

  it('returns the remaining video credits for the tier', async () => {
    const { service } = makeService({ totalUse: 2 });

    const result = await service.checkCredits(org(), 'ai_videos');

    expect(result.credits).toBe(pricing.STANDARD.generate_videos - 2);
  });

  it('resets on the first monthly anniversary of the subscription after now', async () => {
    const { service } = makeService();

    const { resetsAt } = await service.checkCredits(org(), 'ai_images');

    const resets = dayjs(resetsAt);
    // Strictly after now...
    expect(resets.isAfter(dayjs())).toBe(true);
    // ...and the *first* such anniversary, not a later one.
    expect(resets.subtract(1, 'month').isAfter(dayjs())).toBe(false);
    // ...and an exact monthly anniversary of createdAt, not an approximation.
    const months = resets.diff(createdAt, 'month');
    expect(dayjs(createdAt).add(months, 'month').toISOString()).toBe(resetsAt);
  });

  it('resets exactly one month after the window it counts usage from', async () => {
    const { service, repository } = makeService();

    const { resetsAt } = await service.checkCredits(org(), 'ai_images');

    // The two must come from the same walk — a separately derived date could
    // disagree with the usage window that produced the refusal.
    const [, checkFromMonth] = repository.getCreditsFrom.mock.calls[0];
    expect(dayjs(checkFromMonth).add(1, 'month').toISOString()).toBe(resetsAt);
  });

  it('has no reset date on FREE, which has no credit window', async () => {
    const { service, repository } = makeService();

    const result = await service.checkCredits(org({ tier: 'FREE' }));

    expect(result.credits).toBe(0);
    expect(result.resetsAt).toBeUndefined();
    expect(repository.getCreditsFrom).not.toHaveBeenCalled();
  });
});
