// The repository's constructor takes Prisma's model wrappers, and the real
// module opens a database client at import; only the query shape is under
// test (same pattern as users.repository.spec).
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
}));

import { OrganizationRepository } from './organization.repository';

// The admin search (Impersonate, Switch User, public GET /users) lists every
// match, so its order has to be stated: the newest sign-up comes first.
describe('OrganizationRepository.getImpersonateUser', () => {
  it('lists the newest sign-up first', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrganizationRepository(
      {} as unknown as ConstructorParameters<typeof OrganizationRepository>[0],
      {
        model: { userOrganization: { findMany } },
      } as unknown as ConstructorParameters<typeof OrganizationRepository>[1],
      {} as unknown as ConstructorParameters<typeof OrganizationRepository>[2]
    );

    await repository.getImpersonateUser('@');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { user: { createdAt: 'desc' } },
      })
    );
  });
});
