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

const makeService = (
  over: { totalUse?: number; subscription?: unknown; deleted?: number } = {}
) => {
  const repository = {
    getCreditsFrom: jest.fn().mockResolvedValue(over.totalUse ?? 0),
    getSubscription: jest.fn().mockResolvedValue(over.subscription ?? null),
    deleteCreditsFrom: jest
      .fn()
      .mockResolvedValue({ count: over.deleted ?? 0 }),
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

// The public API's POST /credits/reset, behind the existing super-admin check.
describe('resetCredits', () => {
  it('answers null for an organization without a subscription, and deletes nothing', async () => {
    const { service, repository } = makeService();

    await expect(
      service.resetCredits('org-1', 'ai_images')
    ).resolves.toBeNull();
    expect(repository.deleteCreditsFrom).not.toHaveBeenCalled();
  });

  it("deletes the type's credits used since the current period started, and says how many", async () => {
    const { service, repository } = makeService({
      subscription: { createdAt },
      deleted: 3,
    });

    await expect(service.resetCredits('org-1', 'ai_videos')).resolves.toEqual({
      deleted: 3,
    });
    expect(repository.deleteCreditsFrom).toHaveBeenCalledWith(
      'org-1',
      expect.anything(),
      'ai_videos'
    );
  });

  // A reset must free exactly what checkCredits counts, or a user is refused
  // right after the reset (or credited for an older period).
  it('counts from the same window checkCredits counts usage over', async () => {
    const { service, repository } = makeService({
      subscription: { createdAt },
    });

    await service.resetCredits('org-1', 'ai_images');
    await service.checkCredits(org(), 'ai_images');

    const [, resetFrom] = repository.deleteCreditsFrom.mock.calls[0];
    const [, countedFrom] = repository.getCreditsFrom.mock.calls[0];
    expect(dayjs(resetFrom).toISOString()).toBe(
      dayjs(countedFrom).toISOString()
    );
  });
});

// Channels the old plan's limit disabled come back after an upgrade,
// but only when the new plan holds every channel and its limit grew, so a
// channel the user disabled on purpose stays disabled on a renewal.
const makeModifyService = (over: {
  current?: { subscriptionTier: string; totalChannels: number } | null;
  channels: { disabled: boolean }[];
  enable?: jest.Mock;
  organization?: { id: string } | null;
}) => {
  const repository = {
    getOrganizationByCustomerId: jest
      .fn()
      .mockResolvedValue(
        over.organization === undefined ? { id: 'org-1' } : over.organization
      ),
    getSubscriptionByCustomerId: jest
      .fn()
      .mockResolvedValue(over.current ?? null),
    deleteSubscriptionByCustomerId: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const integrations = {
    getIntegrationsList: jest.fn().mockResolvedValue(over.channels),
    disableIntegrations: jest.fn().mockResolvedValue(undefined),
    enableAllIntegrations:
      over.enable ?? jest.fn().mockResolvedValue({ count: 1 }),
    changeActiveCron: jest.fn().mockResolvedValue(undefined),
  };
  const organizations = {
    disableOrEnableNonSuperAdminUsers: jest.fn().mockResolvedValue(undefined),
  };
  const service = new SubscriptionService(
    repository as unknown as ConstructorParameters<
      typeof SubscriptionService
    >[0],
    integrations as unknown as ConstructorParameters<
      typeof SubscriptionService
    >[1],
    organizations as unknown as ConstructorParameters<
      typeof SubscriptionService
    >[2]
  );
  return { service, integrations, organizations };
};

const channels = (enabled: number, disabled: number) => [
  ...Array.from({ length: enabled }, () => ({ disabled: false })),
  ...Array.from({ length: disabled }, () => ({ disabled: true })),
];

describe('modifySubscription channel limits', () => {
  it('enables every channel again when the new plan holds them all and its limit grew', async () => {
    const { service, integrations } = makeModifyService({
      current: { subscriptionTier: 'STANDARD', totalChannels: 10 },
      channels: channels(9, 3),
    });

    await expect(service.modifySubscription('cus_1', 25, 'TEAM')).resolves.toBe(
      true
    );

    expect(integrations.enableAllIntegrations).toHaveBeenCalledTimes(1);
    expect(integrations.enableAllIntegrations).toHaveBeenCalledWith('org-1');
    expect(integrations.disableIntegrations).not.toHaveBeenCalled();
  });

  it('enables nothing when the limit did not grow', async () => {
    const { service, integrations } = makeModifyService({
      current: { subscriptionTier: 'STANDARD', totalChannels: 10 },
      channels: channels(6, 2),
    });

    await service.modifySubscription('cus_1', 10, 'STANDARD');

    expect(integrations.enableAllIntegrations).not.toHaveBeenCalled();
  });

  it('enables nothing when the new plan cannot hold every channel', async () => {
    const { service, integrations } = makeModifyService({
      current: null,
      channels: channels(2, 30),
    });

    await service.modifySubscription('cus_1', 25, 'TEAM');

    expect(integrations.enableAllIntegrations).not.toHaveBeenCalled();
  });

  it('enables nothing on the free plan', async () => {
    const { service, integrations } = makeModifyService({
      current: { subscriptionTier: 'STANDARD', totalChannels: 10 },
      channels: channels(0, 1),
    });

    await service.modifySubscription('cus_1', 1, 'FREE');

    expect(integrations.enableAllIntegrations).not.toHaveBeenCalled();
  });

  it('logs a failed re-enable and still completes the plan change', async () => {
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { service } = makeModifyService({
      current: { subscriptionTier: 'STANDARD', totalChannels: 10 },
      channels: channels(9, 3),
      enable: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(service.modifySubscription('cus_1', 25, 'TEAM')).resolves.toBe(
      true
    );
    expect(error).toHaveBeenCalledWith(
      'Error enabling channels after subscription change:',
      expect.any(Error)
    );
    error.mockRestore();
  });
});

// Account deletion removes the subscription row first, so the cancellation
// Stripe sends afterwards finds none. The webhook must still answer.
describe('a cancellation that follows an account deletion', () => {
  it('changes nothing once the organization is gone', async () => {
    const { service, integrations, organizations } = makeModifyService({
      current: null,
      channels: [],
      organization: null,
    });

    await expect(
      service.deleteSubscription('cus_1', 'stripe')
    ).resolves.toEqual({ count: 0 });
    expect(integrations.getIntegrationsList).not.toHaveBeenCalled();
    expect(integrations.disableIntegrations).not.toHaveBeenCalled();
    expect(integrations.changeActiveCron).not.toHaveBeenCalled();
    expect(
      organizations.disableOrEnableNonSuperAdminUsers
    ).not.toHaveBeenCalled();
  });

  // The organization lookup does not filter out soft-deleted rows, so a
  // deleted organization is still found.
  it('answers when the organization is soft-deleted and has no subscription row', async () => {
    const { service } = makeModifyService({ current: null, channels: [] });

    await expect(
      service.deleteSubscription('cus_1', 'stripe')
    ).resolves.toEqual({ count: 0 });
  });
});
