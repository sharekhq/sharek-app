// The controller's imports drag Prisma and the services behind it; none of that
// code runs here, so the modules are swapped for empty shells (same pattern as
// support.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/services/payment/payment.service', () => ({
  PaymentService: class {},
}));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BillingController } from './billing.controller';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { PaymentService } from '@gitroom/nestjs-libraries/services/payment/payment.service';

// Real routing, because the query name is the contract with the return page: a
// wrong one loses the session without an error, and the page spins forever.
describe('GET /billing/check/:id', () => {
  const checkSubscription = jest.fn();
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: SubscriptionService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: UsersService, useValue: {} },
        {
          provide: PaymentService,
          useValue: {
            getProviderForOrganization: async () => ({ checkSubscription }),
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { org: unknown }, _res: unknown, next: () => void) => {
      req.org = { id: 'org-1' };
      next();
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    checkSubscription.mockReset().mockResolvedValue(1);
  });

  it('hands the session on the url to the provider', async () => {
    const response = await fetch(
      `${url}/billing/check/v0R882f9Rs?session=cs_live_a1b2c3`
    );

    await expect(response.json()).resolves.toEqual({ status: 1 });
    expect(checkSubscription).toHaveBeenCalledWith(
      'org-1',
      'v0R882f9Rs',
      'cs_live_a1b2c3'
    );
  });

  it('asks without a session when the url names none', async () => {
    await fetch(`${url}/billing/check/v0R882f9Rs`);

    expect(checkSubscription).toHaveBeenCalledWith(
      'org-1',
      'v0R882f9Rs',
      undefined
    );
  });
});
