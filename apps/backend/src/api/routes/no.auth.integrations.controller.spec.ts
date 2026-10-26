// AuthService signs, verifies and encrypts with this secret.
process.env.JWT_SECRET = 'test';

// The controller's imports pull in Redis, Prisma, the Temporal client and every
// social provider; none of that code runs here, so the modules are swapped for
// shells (same pattern as enterprise.controller.spec).
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);

import { HttpException } from '@nestjs/common';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { NoAuthIntegrationsController } from './no.auth.integrations.controller';

// The browser extension sends back the token it was given for the channel and
// the platform's fresh cookies, base64-encoded.
const cookies = { client_id: 'client-1', auth_token: 'auth-1' };
const extensionToken = {
  integrationId: 'channel-1',
  organizationId: 'org-1',
  internalId: 'skool-user-1',
  provider: 'skool',
};

const makeController = () => {
  const integrations = {
    getIntegrationById: jest.fn().mockResolvedValue({
      id: 'channel-1',
      name: 'Skool',
      internalId: 'skool-user-1',
      providerIdentifier: 'skool',
    }),
    createOrUpdateIntegration: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    refreshNeeded: jest.fn(),
  };
  const provider = {
    isChromeExtension: true,
    authenticate: jest.fn().mockResolvedValue({
      id: 'skool-user-1',
      accessToken: 'session-1',
      expiresIn: 3600,
    }),
  };

  return {
    controller: new NoAuthIntegrationsController(
      { getSocialIntegration: jest.fn().mockReturnValue(provider) } as any,
      integrations as any,
      {} as any,
      {} as any
    ),
    integrations,
  };
};

const refresh = (controller: NoAuthIntegrationsController, payload: object) =>
  controller.extensionRefreshCookies({
    jwt: AuthService.signJWT(payload),
    cookies: Buffer.from(JSON.stringify(cookies)).toString('base64'),
  });

describe('NoAuthIntegrationsController.extensionRefreshCookies', () => {
  // Skool reads its cookies back with fixedDecryption, as connecting stores
  // them; a signed copy of the request's JSON is the old, legacy format.
  it('stores the cookies encrypted, as connecting the channel does', async () => {
    const { controller, integrations } = makeController();

    await expect(refresh(controller, extensionToken)).resolves.toEqual({
      success: true,
    });
    const stored =
      integrations.createOrUpdateIntegration.mock.calls[0].slice(-1)[0];
    expect(JSON.parse(AuthService.fixedDecryption(stored))).toEqual(cookies);
  });

  it.each([
    // The invite used to sign the whole request body, so it could carry the
    // extension's fields.
    [
      'a team invite token',
      { ...extensionToken, timeLimit: '2026-10-28 12:00:00' },
    ],
    [
      'a password reset token',
      { ...extensionToken, expires: '2026-10-27 12:00:00' },
    ],
    [
      'a channel id that is not a string',
      { ...extensionToken, integrationId: { not: '' } },
    ],
  ])('refuses %s without touching a channel', async (_label, payload) => {
    const { controller, integrations } = makeController();

    await expect(refresh(controller, payload)).rejects.toBeInstanceOf(
      HttpException
    );
    expect(integrations.getIntegrationById).not.toHaveBeenCalled();
    expect(integrations.createOrUpdateIntegration).not.toHaveBeenCalled();
  });

  it("refuses a token naming another provider than the channel's", async () => {
    const { controller, integrations } = makeController();

    await expect(
      refresh(controller, { ...extensionToken, provider: 'x' })
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrations.createOrUpdateIntegration).not.toHaveBeenCalled();
  });
});
