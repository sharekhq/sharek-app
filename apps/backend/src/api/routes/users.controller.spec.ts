// The controller's imports pull in Prisma, Stripe and the auth services; none of
// that code runs here, so those modules are swapped for shells (same pattern as
// support.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/services/payment/payment.service', () => ({
  PaymentService: class {},
}));
jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({
  UsersService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));

import { UsersController } from './users.controller';

const makeController = (getOrgsByUserId: jest.Mock) =>
  new UsersController(
    {} as unknown as ConstructorParameters<typeof UsersController>[0],
    {} as unknown as ConstructorParameters<typeof UsersController>[1],
    {} as unknown as ConstructorParameters<typeof UsersController>[2],
    { getOrgsByUserId } as unknown as ConstructorParameters<
      typeof UsersController
    >[3],
    {} as unknown as ConstructorParameters<typeof UsersController>[4],
    {} as unknown as ConstructorParameters<typeof UsersController>[5]
  );

const user = { id: 'user-1' } as unknown as Parameters<
  UsersController['getOrgs']
>[0];

const subscription = {
  subscriptionTier: 'STANDARD',
  totalChannels: 5,
  isLifetime: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

// What the repository reads: the whole organization row, which carries the
// API key and the Stripe customer id, plus the caller's membership and the plan.
const organizationRow = (id: string, disabled: boolean) => ({
  id,
  name: `Organization ${id}`,
  apiKey: `api-key-${id}`,
  paymentId: `cus_${id}`,
  allowTrial: false,
  isTrailing: false,
  users: [{ disabled, role: 'USER' }],
  subscription,
});

// Every member can call this list, while /user/self shows the API key to admins
// only, so the list answers with what the organization switcher reads.
describe('UsersController.getOrgs', () => {
  it("answers with each organization's id, name, the caller's membership and the plan only", async () => {
    const controller = makeController(
      jest.fn().mockResolvedValue([organizationRow('org-1', false)])
    );

    await expect(controller.getOrgs(user)).resolves.toEqual([
      {
        id: 'org-1',
        name: 'Organization org-1',
        users: [{ disabled: false, role: 'USER' }],
        subscription,
      },
    ]);
  });

  it('leaves out organizations where the membership is disabled', async () => {
    const controller = makeController(
      jest
        .fn()
        .mockResolvedValue([
          organizationRow('org-1', false),
          organizationRow('org-2', true),
        ])
    );

    const organizations = await controller.getOrgs(user);

    expect(organizations.map((organization) => organization.id)).toEqual([
      'org-1',
    ]);
  });
});
