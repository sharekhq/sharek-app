// AuthService signs and verifies every token with this secret.
process.env.JWT_SECRET = 'test';

// The controller's imports pull in every social provider and Prisma; none of
// that code runs here, so the modules are swapped for shells (same pattern as
// support.controller.spec).
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);

import type { User } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { EnterpriseController } from './enterprise.controller';

// What the auth cookie and the activation link carry: the whole User row
// without its password, as the backend's AuthService signs it.
const loginToken: Omit<User, 'password'> = {
  id: 'user-1',
  email: 'someone@example.com',
  providerName: 'LOCAL',
  name: 'Someone',
  lastName: null,
  isSuperAdmin: false,
  bio: null,
  audience: 0,
  pictureId: null,
  providerId: null,
  timezone: 0,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
  updatedAt: new Date('2026-10-01T09:00:00.000Z'),
  lastReadNotifications: new Date('2026-10-01T09:00:00.000Z'),
  inviteId: null,
  activated: true,
  account: null,
  connectedAccount: false,
  lastOnline: new Date('2026-10-01T09:00:00.000Z'),
  ip: null,
  agent: null,
  deletedAt: null,
  sendSuccessEmails: true,
  sendFailureEmails: true,
  sendStreakEmails: true,
};

const makeController = () => {
  const createMaxUser = jest
    .fn()
    .mockResolvedValue({ id: 'org-2', apiKey: 'encrypted-key' });

  return {
    controller: new EnterpriseController(
      {} as any,
      { createMaxUser } as any,
      {} as any,
      {} as any
    ),
    createMaxUser,
  };
};

// The route sits outside AuthMiddleware and creates an ULTIMATE lifetime
// organization, so it acts only on the enterprise payload, never on another
// token the app signs with the same secret (CVE-2026-94455).
describe('EnterpriseController.createUser', () => {
  it('creates the organization from an enterprise token', async () => {
    const { controller, createMaxUser } = makeController();
    const params = AuthService.signJWT({
      id: 'acme-1',
      name: 'Acme',
      email: 'owner@acme.test',
      saasName: 'acme',
    });

    await expect(controller.createUser(params)).resolves.toEqual({
      id: 'org-2',
      apiKey: 'encrypted-key',
    });
    expect(createMaxUser).toHaveBeenCalledWith(
      'acme-1',
      'Acme',
      'acme',
      'owner@acme.test'
    );
  });

  it.each([
    ['a login token', loginToken],
    // The invite spreads the request body into the token, so a saasName sent
    // with the invite is signed along with it.
    [
      'a team invite token, even one that carries a saasName',
      {
        email: 'new@example.com',
        role: 'USER',
        sendEmail: false,
        saasName: 'acme',
        orgId: 'org-1',
        timeLimit: '2026-10-08 12:00:00',
        id: 'a1b2c',
      },
    ],
    [
      'a password reset token',
      { id: 'user-1', expires: '2026-10-06 12:20:00' },
    ],
    [
      'a token without a saasName',
      { id: 'acme-1', name: 'Acme', email: 'owner@acme.test' },
    ],
    [
      'a token without an id',
      { name: 'Acme', email: 'owner@acme.test', saasName: 'acme' },
    ],
  ])('refuses %s', async (_token, payload) => {
    const { controller, createMaxUser } = makeController();

    await expect(
      controller.createUser(AuthService.signJWT(payload))
    ).resolves.toEqual({ success: false });
    expect(createMaxUser).not.toHaveBeenCalled();
  });
});
