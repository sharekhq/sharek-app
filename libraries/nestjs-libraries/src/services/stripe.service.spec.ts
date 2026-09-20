// StripeService builds its Stripe client at module scope, so standing in for the
// SDK is the only way to see whether a call reaches Stripe at all — which is the
// whole question for a comped plan.
const mockSubscriptionsList = jest.fn();
const mockSubscriptionsCancel = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: class {
    subscriptions = {
      list: mockSubscriptionsList,
      cancel: mockSubscriptionsCancel,
    };
  },
}));

// The constructor deps drag in Prisma; none of their code runs here, so the
// modules are swapped for empty shells (same pattern as subscription.service.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));

import { StripeService } from './stripe.service';

const makeService = (paymentId: string | null) => {
  const subscriptionService = {
    deleteSubscription: jest.fn().mockResolvedValue({ count: 1 }),
    deleteSubscriptionByOrgId: jest.fn().mockResolvedValue({ count: 1 }),
    updateCustomerId: jest.fn().mockResolvedValue(undefined),
  };
  const organizationService = {
    getOrgById: jest.fn().mockResolvedValue({ id: 'org-1', paymentId }),
  };
  const service = new StripeService(
    subscriptionService as any,
    organizationService as any,
    {} as any,
    {} as any
  );

  return { service, subscriptionService };
};

// The super-admin "add subscription" dropdown comps a plan with no Stripe object
// at all: addSubscription writes the granting user's id into org.paymentId. Handing
// that to Stripe throws "No such customer", which the admin modal swallows — it
// closes and reloads either way — so the plan silently stayed put.
const COMPED_PAYMENT_ID = '4f2d9c1a-6b7e-4d3f-8a15-683a352586c4';

describe('cancelSubscription', () => {
  beforeEach(() => {
    mockSubscriptionsList.mockReset();
    mockSubscriptionsCancel.mockReset();
  });

  it('downgrades a comped plan to FREE without calling Stripe', async () => {
    const { service, subscriptionService } = makeService(COMPED_PAYMENT_ID);

    await expect(service.cancelSubscription('org-1')).resolves.toEqual({
      cancelled: true,
    });

    expect(subscriptionService.deleteSubscriptionByOrgId).toHaveBeenCalledWith(
      'org-1',
      'stripe'
    );
    expect(mockSubscriptionsList).not.toHaveBeenCalled();
    expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
  });

  it('clears the user id the comp left in paymentId, so a later checkout can open a real customer', async () => {
    const { service, subscriptionService } = makeService(COMPED_PAYMENT_ID);

    await service.cancelSubscription('org-1');

    expect(subscriptionService.updateCustomerId).toHaveBeenCalledWith(
      'org-1',
      null
    );
  });

  it.each([
    ['a comped org', COMPED_PAYMENT_ID],
    ['an org that never had a payment id', null],
  ])(
    'throws when %s has no subscription row to remove',
    async (_name, paymentId) => {
      const { service, subscriptionService } = makeService(paymentId);
      subscriptionService.deleteSubscriptionByOrgId.mockResolvedValue(false);

      await expect(service.cancelSubscription('org-1')).rejects.toThrow(
        'No active subscription found'
      );
      expect(subscriptionService.updateCustomerId).not.toHaveBeenCalled();
    }
  );

  it('still cancels at Stripe when the org has a real customer', async () => {
    const { service, subscriptionService } = makeService('cus_123');
    mockSubscriptionsList.mockResolvedValue({
      data: [{ id: 'sub_1', status: 'active' }],
    });

    await expect(service.cancelSubscription('org-1')).resolves.toEqual({
      cancelled: true,
    });

    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_1');
    expect(subscriptionService.deleteSubscription).toHaveBeenCalledWith(
      'cus_123',
      'stripe'
    );
    expect(subscriptionService.updateCustomerId).not.toHaveBeenCalled();
  });
});
