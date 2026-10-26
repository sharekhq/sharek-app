// AuthService signs the invite with this secret.
process.env.JWT_SECRET = 'test';

// The service's constructor takes the repository and the notification
// service, whose real modules open a database client at import; neither runs
// here (same pattern as organization.repository.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository',
  () => ({ OrganizationRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service',
  () => ({ AutopostService: class {} })
);

import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { OrganizationService } from './organization.service';

// The invite link carries a token signed with the app's one secret, and the
// API's ValidationPipe keeps body properties the DTO never declared, so only
// the invite's own fields may be signed into it.
describe('OrganizationService.inviteTeamMember', () => {
  const frontendUrl = process.env.FRONTEND_URL;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://dash.example';
  });

  afterAll(() => {
    if (frontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = frontendUrl;
    }
  });

  it('signs only the invite fields into the link, whatever else the body carries', async () => {
    const service = new OrganizationService({} as any, {} as any);

    const { url } = await service.inviteTeamMember(
      { id: 'org-1', name: 'Acme' } as any,
      { name: 'Owner', email: 'owner@example.com' } as any,
      {
        email: 'new@example.com',
        role: 'ADMIN',
        sendEmail: false,
        billing: 'ULTIMATE',
      } as any
    );
    const token = AuthService.verifyJWT(
      new URL(url).searchParams.get('org')!
    ) as Record<string, unknown>;

    expect(Object.keys(token).sort()).toEqual([
      'email',
      'iat',
      'id',
      'orgId',
      'role',
      'timeLimit',
    ]);
    expect(token).toMatchObject({
      email: 'new@example.com',
      role: 'ADMIN',
      orgId: 'org-1',
    });
  });
});
