// The controller's imports pull in Redis, Prisma and the Temporal client; none
// of that code runs here, so those modules are swapped for shells (same pattern
// as enterprise.controller.spec). The integration manager and its providers stay
// real: which provider method the route may run is what these tests are about.
// nostr-tools ships ESM that Jest's CommonJS transform cannot load (see
// integration.manager.spec).
jest.mock('nostr-tools', () => ({
  getPublicKey: () => '',
  finalizeEvent: () => ({}),
  Relay: class {},
  SimplePool: class {},
}));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);

import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationsController } from './integrations.controller';

const org = { id: 'org-1' } as any;

// A Lemmy channel stores the token its server answered when it was connected,
// so a server the user controls can make it any string, a file path included
// (CVE-2026-115931).
const channel = {
  id: 'channel-1',
  providerIdentifier: 'lemmy',
  token: '/proc/self/environ',
  internalId: 'lemmy-user-1',
};

const makeController = () => {
  const manager = new IntegrationManager();
  const integrations = {
    getIntegrationById: jest.fn().mockResolvedValue(channel),
    getMentions: jest.fn().mockResolvedValue([]),
    insertMentions: jest.fn(),
  };

  return {
    controller: new IntegrationsController(
      manager,
      integrations as any,
      {} as any,
      {} as any
    ),
    provider: manager.getSocialIntegration('lemmy') as any,
  };
};

afterEach(() => {
  jest.restoreAllMocks();
});

// POST /integrations/function
describe('IntegrationsController.functionIntegration', () => {
  it('never runs a provider method the dashboard may not call', async () => {
    const { controller, provider } = makeController();
    const readOrFetch = jest
      .spyOn(provider, 'readOrFetch')
      .mockResolvedValue(Buffer.from('JWT_SECRET=x'));

    await expect(
      controller.functionIntegration(org, {
        id: channel.id,
        name: 'readOrFetch',
        data: {},
      })
    ).rejects.toThrow('Function not found');
    expect(readOrFetch).not.toHaveBeenCalled();
  });

  it('runs a function the composer calls, with the channel and its token', async () => {
    const { controller, provider } = makeController();
    const communities = [{ id: 'c-1', name: 'sharek' }];
    const subreddits = jest
      .spyOn(provider, 'subreddits')
      .mockResolvedValue(communities);

    await expect(
      controller.functionIntegration(org, {
        id: channel.id,
        name: 'subreddits',
        data: { word: 'sha' },
      })
    ).resolves.toBe(communities);
    expect(subreddits).toHaveBeenCalledWith(
      channel.token,
      { word: 'sha' },
      channel.internalId,
      channel
    );
  });
});

// POST /integrations/mentions
describe('IntegrationsController.mentions', () => {
  it('runs mention whatever name the request carries', async () => {
    const { controller, provider } = makeController();
    const readOrFetch = jest
      .spyOn(provider, 'readOrFetch')
      .mockResolvedValue(Buffer.from('JWT_SECRET=x'));
    const mention = jest
      .spyOn(provider, 'mention')
      .mockResolvedValue([{ id: 'sharek', label: 'Sharek', image: '' }]);

    await expect(
      controller.mentions(org, {
        id: channel.id,
        name: 'readOrFetch',
        data: { query: 'sha' },
      })
    ).resolves.toEqual([{ id: 'sharek', label: 'Sharek', image: '' }]);
    expect(mention).toHaveBeenCalledWith(
      channel.token,
      { query: 'sha' },
      channel.internalId,
      channel
    );
    expect(readOrFetch).not.toHaveBeenCalled();
  });
});
