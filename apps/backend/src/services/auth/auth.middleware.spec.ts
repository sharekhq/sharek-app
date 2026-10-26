// AuthService signs and verifies every token with this secret.
process.env.JWT_SECRET = 'test';

// The middleware's imports pull in Prisma and Mastra; none of that code runs
// here, so the modules are swapped for shells (same pattern as
// enterprise.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));

import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { AuthMiddleware } from './auth.middleware';

// What the auth cookie carries: the User row without its password, as the
// backend's AuthService signs it at sign-in (the fields this test reads).
const loginToken = {
  id: 'user-1',
  email: 'someone@example.com',
  providerName: 'LOCAL',
  name: 'Someone',
  isSuperAdmin: false,
  activated: true,
  timezone: 0,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
};

const run = async (token: string) => {
  // getUserById is a findFirst, so it answers whichever user the where clause
  // matches first.
  const users = {
    getUserById: jest
      .fn()
      .mockResolvedValue({ ...loginToken, password: 'hash' }),
  };
  const organizations = {
    getOrgsByUserId: jest
      .fn()
      .mockResolvedValue([
        { id: 'org-1', apiKey: 'key-1', users: [{ disabled: false }] },
      ]),
  };
  const req: any = { headers: { auth: token }, cookies: {} };
  const next = jest.fn();

  const outcome = await new AuthMiddleware(organizations as any, users as any)
    .use(req, {} as any, next)
    .catch((err) => err);

  return { outcome, req, next, users };
};

describe('AuthMiddleware', () => {
  it('lets a login token through', async () => {
    const { outcome, req, next, users } = await run(
      AuthService.signJWT(loginToken)
    );

    expect(outcome).toBeUndefined();
    expect(users.getUserById).toHaveBeenCalledWith('user-1');
    expect(req.user.id).toBe('user-1');
    expect(req.org.id).toBe('org-1');
    expect(next).toHaveBeenCalled();
  });

  it('answers 403 to a token whose id is not a string', async () => {
    const { outcome, next, users } = await run(
      AuthService.signJWT({ id: { not: 'nobody' } })
    );

    expect(outcome).toBeInstanceOf(HttpForbiddenException);
    expect(users.getUserById).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
