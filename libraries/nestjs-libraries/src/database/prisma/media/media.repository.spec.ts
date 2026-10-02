// The repository's constructor takes Prisma's model wrapper, and the real
// module opens a database client at import; only the query shape is under
// test, so the wrapper is a plain object holding a spy.
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
}));

import { MediaRepository } from './media.repository';

// A reference names a Media row by id. The id comes from the browser, so the
// query itself has to be the guard: another organization's row, or one the
// user deleted, must come back as missing (FR-006; feature
// 031-ai-image-references-edit, US1).
describe('MediaRepository.getMediaByIds', () => {
  it('reads only live rows of the asking organization, and only their paths', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new MediaRepository({
      model: { media: { findMany } },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);

    await repository.getMediaByIds('org-1', ['a', 'b']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: { in: ['a', 'b'] },
        deletedAt: null,
      },
      select: { id: true, path: true },
    });
  });
});
