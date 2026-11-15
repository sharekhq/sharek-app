// The controller's imports pull in Redis, Prisma, the Temporal client, the
// upload SDKs and every social provider; none of that code runs here, so the
// modules are swapped for shells (same pattern as media.controller.spec).
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
  socialIntegrationList: [],
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service',
  () => ({ ClippingService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service',
  () => ({ AdminStatsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);

import { PublicIntegrationsController } from './public.integrations.controller';

const org = { id: 'org-1' } as any;

const makeController = (media: Record<string, any>) =>
  new PublicIntegrationsController(
    {} as any,
    {} as any,
    media as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

const row = (id: string) => ({
  id,
  name: `${id}.png`,
  originalName: `${id}-original.png`,
  path: `https://cdn.example.com/${id}.png`,
  createdAt: new Date('2026-11-10T12:00:00.000Z'),
});

// GET /public/v1/media is the public API's media list (FR-055, Rule 4): it
// reads the same MediaService.getMedia as the Media Library window, so these
// cases pin what it asks for and the five fields it answers with, whatever the
// service grows for the window.
describe('PublicIntegrationsController.getMedia', () => {
  it("asks the service for the organization's page and search", async () => {
    const getMedia = jest.fn().mockResolvedValue({ pages: 3, results: [] });
    const controller = makeController({ getMedia });

    await controller.getMedia(org, { page: 2, search: 'logo' } as any);

    expect(getMedia.mock.calls).toEqual([['org-1', 2, 'logo']]);
  });

  it('answers the pages and each row with exactly five fields', async () => {
    const controller = makeController({
      getMedia: jest
        .fn()
        .mockResolvedValue({ pages: 3, results: [row('a'), row('b')] }),
    });

    const answer = await controller.getMedia(org, {
      page: 2,
      search: 'logo',
    } as any);

    expect(answer).toStrictEqual({ pages: 3, results: [row('a'), row('b')] });
  });

  it('keeps no tile image, thumbnail or alt the service returns', async () => {
    const controller = makeController({
      getMedia: jest.fn().mockResolvedValue({
        pages: 1,
        results: [
          {
            ...row('a'),
            tileImage: 'https://cdn.example.com/cdn-cgi/image/a.png',
            thumbnail: 'https://cdn.example.com/a-cover.png',
            alt: 'A pomegranate',
            thumbnailTimestamp: 1200,
          },
        ],
      }),
    });

    const { results } = await controller.getMedia(org, { page: 1 } as any);

    expect(results).toStrictEqual([row('a')]);
  });
});
