// The repository's constructor takes Prisma's model wrappers, and the real
// module opens a database client at import; only the query shape is under
// test (same pattern as integration.repository.spec).
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
  PrismaTransaction: class {},
}));

import { UsersRepository } from './users.repository';

const makeRepository = (user: Record<string, jest.Mock>) =>
  new UsersRepository(
    { model: { user } } as unknown as ConstructorParameters<
      typeof UsersRepository
    >[0],
    {} as unknown as ConstructorParameters<typeof UsersRepository>[1]
  );

// A User row holds the password hash, so the write reads back the id only
// and answers nothing (CLAUDE.md).
describe('UsersRepository.updateTimezone', () => {
  it("stores the user's zone, reads back the id only and answers nothing", async () => {
    const update = jest.fn().mockResolvedValue({ id: 'user-1' });

    await expect(
      makeRepository({ update }).updateTimezone('user-1', {
        timezoneName: 'Asia/Dubai',
      })
    ).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { timezoneName: 'Asia/Dubai' },
      select: { id: true },
    });
  });

  it.each([
    ['null', null],
    ['nothing', undefined],
    ['an empty name', ''],
  ])(
    'stores Automatic as no zone when given %s',
    async (_name, timezoneName) => {
      const update = jest.fn().mockResolvedValue({ id: 'user-1' });

      await makeRepository({ update }).updateTimezone('user-1', {
        timezoneName,
      } as { timezoneName?: string });
      expect(update.mock.calls[0][0].data).toEqual({ timezoneName: null });
    }
  );
});
