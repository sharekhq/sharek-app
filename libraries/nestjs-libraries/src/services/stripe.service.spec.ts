// StripeService builds its Stripe client at module scope, so standing in for the
// SDK is the only way to see whether a call reaches Stripe at all — which is the
// whole question for a comped plan.
const mockSubscriptionsList = jest.fn();
const mockSubscriptionsCancel = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockProductsList = jest.fn();
const mockPricesList = jest.fn();
const mockPromotionCodesList = jest.fn();
jest.mock('stripe', () => ({
  __esModule: true,
  default: class {
    subscriptions = {
      list: mockSubscriptionsList,
      cancel: mockSubscriptionsCancel,
      retrieve: mockSubscriptionsRetrieve,
    };
    checkout = { sessions: { create: mockCheckoutSessionsCreate } };
    customers = { update: mockCustomersUpdate };
    products = { list: mockProductsList };
    prices = { list: mockPricesList };
    promotionCodes = { list: mockPromotionCodesList };
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

// The billing events go through the real TrackService, and posthog-node, its
// transport, is the double: each case chooses what the client does. The
// Facebook SDK the same module loads is swapped for inert shells.
const mockCapture = jest.fn();
jest.mock('posthog-node', () => ({
  PostHog: class {
    capture = mockCapture;
    on = jest.fn();
  },
}));
jest.mock('facebook-nodejs-business-sdk', () => ({
  FacebookAdsApi: { init: jest.fn() },
  ServerEvent: class {},
  EventRequest: class {},
  UserData: class {},
  CustomData: class {},
}));

import Stripe from 'stripe';
import { StripeService } from './stripe.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { BillingSubscribeDto } from '@gitroom/nestjs-libraries/dtos/billing/billing.subscribe.dto';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

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

const USER_ID = 'user-1';
const METADATA = {
  service: 'gitroom',
  userId: USER_ID,
  billing: 'STANDARD',
  period: 'MONTHLY',
  uniqueId: 'u',
};
const NO_ACCOUNT = {
  service: 'gitroom',
  billing: 'STANDARD',
  period: 'MONTHLY',
  uniqueId: 'u',
};

const subscription = (fields: Record<string, unknown> = {}) =>
  ({
    id: 'sub_1',
    customer: 'cus_1',
    status: 'trialing',
    cancel_at: null,
    trial_end: null,
    ended_at: null,
    cancellation_details: null,
    metadata: METADATA,
    ...fields,
  } as unknown as Stripe.Subscription);

const created = (fields: Record<string, unknown>) =>
  ({
    type: 'customer.subscription.created',
    data: { object: subscription(fields) },
  } as unknown as Stripe.CustomerSubscriptionCreatedEvent);

const updated = (
  fields: Record<string, unknown>,
  previous: Record<string, unknown>
) =>
  ({
    type: 'customer.subscription.updated',
    data: { object: subscription(fields), previous_attributes: previous },
  } as unknown as Stripe.CustomerSubscriptionUpdatedEvent);

const deleted = (fields: Record<string, unknown>) =>
  ({
    type: 'customer.subscription.deleted',
    data: { object: subscription({ status: 'canceled', ...fields }) },
  } as unknown as Stripe.CustomerSubscriptionDeletedEvent);

const invoicePaid = (fields: Record<string, unknown> = {}) =>
  ({
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_1',
        amount_paid: 2500,
        currency: 'usd',
        billing_reason: 'subscription_cycle',
        parent: { subscription_details: { subscription: 'sub_1' } },
        ...fields,
      },
    },
  } as unknown as Stripe.InvoicePaymentSucceededEvent);

const makeBillingService = () => {
  const order: string[] = [];
  mockCapture.mockImplementation(() => {
    order.push('capture');
  });
  // A write is recorded when it resolves, a tick after the call, as a real
  // query's is: a capture that does not wait for it lands first.
  const written = { id: 'subscription-row' };
  const subscriptionService = {
    createOrUpdateSubscription: jest.fn(async () => {
      await Promise.resolve();
      order.push('db');
      return written;
    }),
    deleteSubscription: jest.fn(async () => {
      await Promise.resolve();
      order.push('db');
      return { count: 1 };
    }),
    getSubscription: jest.fn().mockResolvedValue(null),
  };
  // No trial allowed on the customer's org, so the card check passes
  // without reaching Stripe.
  const organizationService = {
    getOrgByCustomerId: jest.fn().mockResolvedValue({ allowTrial: false }),
    getOrgById: jest
      .fn()
      .mockResolvedValue({ id: 'org-1', paymentId: 'cus_1' }),
  };
  // No ip or agent, so the Facebook conversion beside the invoice event is
  // skipped.
  const userService = {
    getUserById: jest.fn().mockResolvedValue({ id: USER_ID, email: 'a@b.c' }),
  };
  const service = new StripeService(
    subscriptionService as unknown as SubscriptionService,
    organizationService as unknown as OrganizationService,
    userService as unknown as UsersService,
    new TrackService()
  );

  return {
    service,
    order,
    written,
    subscriptionService,
    organizationService,
    userService,
  };
};

type Doubles = ReturnType<typeof makeBillingService>;

// Each flow reports what it returned to Stripe; the doubles record what it
// called.
const flows: Array<[string, (doubles: Doubles) => Promise<unknown>]> = [
  [
    'a trial start',
    ({ service }) => service.processWebhook(created({ status: 'trialing' })),
  ],
  [
    'a subscription created active',
    ({ service }) => service.processWebhook(created({ status: 'active' })),
  ],
  [
    'a trial conversion',
    ({ service }) =>
      service.processWebhook(
        updated({ status: 'active' }, { status: 'trialing' })
      ),
  ],
  [
    'an incomplete subscription becoming active',
    ({ service }) =>
      service.processWebhook(
        updated({ status: 'active' }, { status: 'incomplete' })
      ),
  ],
  [
    'a cancellation',
    ({ service }) =>
      service.processWebhook(deleted({ trial_end: 1000, ended_at: 2000 })),
  ],
  ['a paid invoice', ({ service }) => service.processWebhook(invoicePaid())],
];

const run = async (
  flow: (doubles: Doubles) => Promise<unknown>,
  arrange: () => void = () => undefined
) => {
  jest.clearAllMocks();
  const doubles = makeBillingService();
  arrange();
  const result = await flow(doubles);
  const { subscriptionService, organizationService, userService } = doubles;

  return {
    result,
    calls: [
      subscriptionService.createOrUpdateSubscription.mock.calls,
      subscriptionService.deleteSubscription.mock.calls,
      organizationService.getOrgByCustomerId.mock.calls,
      userService.getUserById.mock.calls,
      mockSubscriptionsRetrieve.mock.calls,
    ],
  };
};

describe('billing events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
    mockSubscriptionsRetrieve.mockResolvedValue(
      subscription({ status: 'active' })
    );
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  });

  describe('subscription webhooks', () => {
    it('records trial_started once a trialing subscription is stored', async () => {
      const { service, order, written } = makeBillingService();

      const result = await service.processWebhook(
        created({ status: 'trialing' })
      );

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: USER_ID,
        event: 'trial_started',
        properties: {
          subscription_id: 'sub_1',
          plan: 'STANDARD',
          period: 'MONTHLY',
        },
      });
      expect(order).toEqual(['db', 'capture']);
      expect(result).toBe(written);
    });

    it('records subscription_activated for a subscription created active', async () => {
      const { service, order, written } = makeBillingService();

      const result = await service.processWebhook(
        created({ status: 'active' })
      );

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: USER_ID,
        event: 'subscription_activated',
        properties: {
          subscription_id: 'sub_1',
          plan: 'STANDARD',
          period: 'MONTHLY',
          from_trial: false,
        },
      });
      expect(order).toEqual(['db', 'capture']);
      expect(result).toBe(written);
    });

    it.each(['past_due', 'unpaid'])(
      'stores a subscription created %s and records nothing',
      async (status) => {
        const { service, subscriptionService, written } = makeBillingService();

        const result = await service.processWebhook(created({ status }));

        expect(
          subscriptionService.createOrUpdateSubscription
        ).toHaveBeenCalledTimes(1);
        expect(mockCapture).not.toHaveBeenCalled();
        expect(result).toBe(written);
      }
    );

    it('stores nothing and records nothing when the card check fails', async () => {
      const { service, subscriptionService } = makeBillingService();

      const result = await service.processWebhook(
        created({ status: 'incomplete' })
      );

      expect(result).toEqual({ ok: false });
      expect(
        subscriptionService.createOrUpdateSubscription
      ).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('records subscription_activated as a trial conversion when a trial becomes active', async () => {
      const { service, order, written } = makeBillingService();

      const result = await service.processWebhook(
        updated({ status: 'active' }, { status: 'trialing' })
      );

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: USER_ID,
        event: 'subscription_activated',
        properties: {
          subscription_id: 'sub_1',
          plan: 'STANDARD',
          period: 'MONTHLY',
          from_trial: true,
        },
      });
      expect(order).toEqual(['db', 'capture']);
      expect(result).toBe(written);
    });

    // A subscription charged at once (no trial) is created incomplete, and its
    // created event stores nothing: this update is where it is first stored
    // as active.
    it('records subscription_activated when a subscription created incomplete becomes active', async () => {
      const { service, order, written } = makeBillingService();

      const result = await service.processWebhook(
        updated({ status: 'active' }, { status: 'incomplete' })
      );

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: USER_ID,
        event: 'subscription_activated',
        properties: {
          subscription_id: 'sub_1',
          plan: 'STANDARD',
          period: 'MONTHLY',
          from_trial: false,
        },
      });
      expect(order).toEqual(['db', 'capture']);
      expect(result).toBe(written);
    });

    it.each([
      ['a plan change', { status: 'active' }, { items: { data: [] } }],
      ['a renewal', { status: 'active' }, { latest_invoice: 'in_0' }],
      [
        'a scheduled cancellation',
        { status: 'active', cancel_at_period_end: true },
        { cancel_at_period_end: false },
      ],
      ['a failed renewal', { status: 'past_due' }, { status: 'active' }],
      [
        'a recovery from past due',
        { status: 'active' },
        { status: 'past_due' },
      ],
      [
        'a trial finished early whose charge fails',
        { status: 'past_due' },
        { status: 'trialing' },
      ],
    ])('stores %s and records nothing', async (_name, fields, previous) => {
      const { service, subscriptionService, written } = makeBillingService();

      const result = await service.processWebhook(updated(fields, previous));

      expect(
        subscriptionService.createOrUpdateSubscription
      ).toHaveBeenCalledTimes(1);
      expect(mockCapture).not.toHaveBeenCalled();
      expect(result).toBe(written);
    });

    // Stripe sends no previous status on deletion: a subscription that ended
    // no later than its trial end was still in its trial.
    it.each([
      ['during its trial', { trial_end: 2000, ended_at: 1000 }, 'trialing'],
      ['at its trial end', { trial_end: 2000, ended_at: 2000 }, 'trialing'],
      ['after its trial', { trial_end: 2000, ended_at: 3000 }, 'active'],
      ['that never had a trial', { trial_end: null, ended_at: 3000 }, 'active'],
    ])(
      'records subscription_cancelled for a subscription deleted %s',
      async (_name, fields, previousStatus) => {
        const { service, order } = makeBillingService();

        const result = await service.processWebhook(
          deleted({
            ...fields,
            cancellation_details: { reason: 'cancellation_requested' },
          })
        );

        expect(mockCapture).toHaveBeenCalledTimes(1);
        expect(mockCapture).toHaveBeenCalledWith({
          distinctId: USER_ID,
          event: 'subscription_cancelled',
          properties: {
            subscription_id: 'sub_1',
            plan: 'STANDARD',
            period: 'MONTHLY',
            previous_status: previousStatus,
            cancellation_reason: 'cancellation_requested',
          },
        });
        expect(order).toEqual(['db', 'capture']);
        expect(result).toBeUndefined();
      }
    );

    // The reason is what separates a plan deleted by dunning from a user's
    // choice.
    it.each([
      ['a reason', { reason: 'payment_failed' }, 'payment_failed'],
      ['a null reason', { reason: null }, null],
      ['no cancellation details', null, null],
    ])(
      'records the cancellation reason from %s',
      async (_name, cancellationDetails, reason) => {
        const { service } = makeBillingService();

        await service.processWebhook(
          deleted({ ended_at: 3000, cancellation_details: cancellationDetails })
        );

        expect(mockCapture).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'subscription_cancelled',
            properties: expect.objectContaining({
              cancellation_reason: reason,
            }),
          })
        );
      }
    );
  });

  describe('invoice webhook', () => {
    it('records payment_succeeded for a paid invoice, in major units and an ISO currency', async () => {
      const { service } = makeBillingService();

      const result = await service.processWebhook(invoicePaid());

      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: USER_ID,
        event: 'payment_succeeded',
        properties: {
          amount: 25,
          currency: 'USD',
          billing_reason: 'subscription_cycle',
          subscription_id: 'sub_1',
          invoice_id: 'in_1',
        },
      });
      expect(result).toEqual({ ok: true });
    });

    it.each([
      ['a null', null],
      ['a missing', undefined],
    ])('records %s billing reason as null', async (_name, billingReason) => {
      const { service } = makeBillingService();

      await service.processWebhook(
        invoicePaid({ billing_reason: billingReason })
      );

      expect(mockCapture).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'payment_succeeded',
          properties: expect.objectContaining({ billing_reason: null }),
        })
      );
    });

    // A trial starts with an invoice for nothing.
    it('records nothing for an invoice paid at zero', async () => {
      const { service } = makeBillingService();

      const result = await service.processWebhook(
        invoicePaid({ amount_paid: 0, billing_reason: 'subscription_create' })
      );

      expect(mockCapture).not.toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });
  });

  // An event is recorded against the account the subscription names, or not
  // at all.
  describe('without an account id', () => {
    it.each([
      ['a trial start', created({ status: 'trialing', metadata: NO_ACCOUNT })],
      [
        'a subscription created active',
        created({ status: 'active', metadata: NO_ACCOUNT }),
      ],
      [
        'a trial conversion',
        updated(
          { status: 'active', metadata: NO_ACCOUNT },
          { status: 'trialing' }
        ),
      ],
    ])('stores %s and records nothing', async (_name, event) => {
      const { service, written } = makeBillingService();

      expect(await service.processWebhook(event)).toBe(written);
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('removes a cancelled subscription and records nothing', async () => {
      const { service, subscriptionService } = makeBillingService();

      const result = await service.processWebhook(
        deleted({ ended_at: 3000, metadata: NO_ACCOUNT })
      );

      expect(result).toBeUndefined();
      expect(subscriptionService.deleteSubscription).toHaveBeenCalledTimes(1);
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it('records nothing for a paid invoice', async () => {
      mockSubscriptionsRetrieve.mockResolvedValue(
        subscription({ status: 'active', metadata: NO_ACCOUNT })
      );
      const { service } = makeBillingService();

      expect(await service.processWebhook(invoicePaid())).toEqual({ ok: true });
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  // PostHog's Stripe source joins a customer's payments to the person this
  // key names.
  describe('checkout metadata', () => {
    const body = {
      billing: 'STANDARD',
      period: 'MONTHLY',
    } as BillingSubscribeDto;

    beforeEach(() => {
      mockProductsList.mockResolvedValue({
        data: [{ id: 'prod_1', name: 'STANDARD' }],
      });
      mockPricesList.mockResolvedValue({
        data: [
          {
            id: 'price_1',
            unit_amount: pricing.STANDARD.month_price * 100,
            recurring: { interval: 'month' },
          },
        ],
      });
      mockPromotionCodesList.mockResolvedValue({ data: [] });
      mockCustomersUpdate.mockResolvedValue({});
    });

    it.each([
      [
        'hosted',
        (service: StripeService) =>
          service.subscribe('u', 'org-1', USER_ID, body, true),
        { url: 'https://checkout.stripe.com/c/pay/cs_1' },
      ],
      [
        'embedded',
        (service: StripeService) =>
          service.embedded('u', 'org-1', USER_ID, body, true),
        { client_secret: 'cs_1_secret' },
      ],
    ])(
      'names the buyer as the analytics person in the %s checkout',
      async (_name, open, session) => {
        mockCheckoutSessionsCreate.mockResolvedValue(session);
        const { service } = makeBillingService();

        await open(service);

        expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_data: expect.objectContaining({
              metadata: expect.objectContaining({
                userId: USER_ID,
                posthog_person_distinct_id: USER_ID,
              }),
            }),
          })
        );
      }
    );
  });

  // FR-017: analytics never changes what a billing webhook returns to Stripe
  // or calls, whatever state PostHog is in. A failed delivery is not a mode
  // here: posthog-node reports it on its emitter from a flush that runs after
  // the handler has returned, and the TrackService spec covers that listener.
  const failures: Array<[string, () => void]> = [
    [
      'the PostHog client throws',
      () =>
        mockCapture.mockImplementation(() => {
          throw new Error('boom');
        }),
    ],
    [
      'PostHog is not configured',
      () => {
        delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
      },
    ],
  ];

  describe.each(failures)('when %s', (_, arrange) => {
    it.each(flows)(
      '%s returns and calls what it does when the event is recorded',
      async (_name, flow) => {
        const recorded = await run(flow);
        const failing = await run(flow, arrange);

        expect(failing.result).toEqual(recorded.result);
        expect(failing.calls).toEqual(recorded.calls);
      }
    );
  });
});
