// PermissionsService's constructor deps drag in Prisma; none of their code
// runs here, so the modules are swapped for empty shells (same pattern as
// subscription.service.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({
    PostsService: class {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({
    WebhooksService: class {},
  })
);

import { PermissionsService } from './permissions.service';
import { AuthorizationActions, Sections } from './permission.exception.class';

// An organization exactly at its plan's channel limit: 10 of 10.
const makeService = (refreshed: unknown) => {
  const integrations = {
    getIntegrationByInternalId: jest.fn().mockResolvedValue(refreshed),
    getIntegrationById: jest.fn(),
    getIntegrationsList: jest
      .fn()
      .mockResolvedValue(
        Array.from({ length: 10 }, () => ({ refreshNeeded: false }))
      ),
  };
  const subscriptions = {
    getSubscriptionByOrganizationId: jest
      .fn()
      .mockResolvedValue({ subscriptionTier: 'STANDARD', totalChannels: 10 }),
  };
  const service = new PermissionsService(
    subscriptions as unknown as ConstructorParameters<
      typeof PermissionsService
    >[0],
    {} as unknown as ConstructorParameters<typeof PermissionsService>[1],
    integrations as unknown as ConstructorParameters<
      typeof PermissionsService
    >[2],
    {} as unknown as ConstructorParameters<typeof PermissionsService>[3]
  );
  return { service, integrations };
};

const canAddChannel = (service: PermissionsService, refresh?: string) =>
  service
    .check(
      'org-1',
      new Date(),
      'ADMIN',
      [[AuthorizationActions.Create, Sections.CHANNEL]],
      refresh
    )
    .then((ability) =>
      ability.can(AuthorizationActions.Create, Sections.CHANNEL)
    );

beforeEach(() => {
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
});
afterEach(() => {
  delete process.env.STRIPE_PUBLISHABLE_KEY;
});

// Refreshing a connected channel adds none, so the limit does not apply.
describe('channel limit on refresh', () => {
  it('lets a channel of this organization refresh at the limit, found by the id the connect link carries', async () => {
    const { service, integrations } = makeService({ id: 'int-1' });

    await expect(canAddChannel(service, 'internal-123')).resolves.toBe(true);
    expect(integrations.getIntegrationByInternalId).toHaveBeenCalledWith(
      'org-1',
      'internal-123'
    );
  });

  it('still refuses a new channel at the limit', async () => {
    const { service } = makeService(null);

    await expect(canAddChannel(service, 'someone-elses')).resolves.toBe(false);
    await expect(canAddChannel(service)).resolves.toBe(false);
  });
});
