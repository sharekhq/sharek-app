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

// Samy names an image by its link, which reaches the model in chat text, so here
// too the query is the guard: a link that isn't this organization's live row comes
// back as missing (feature 050-samy-images, FR-041).
describe('MediaRepository.getMediaByPaths', () => {
  it('reads only live rows of the asking organization, and only their paths', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new MediaRepository({
      model: { media: { findMany } },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);

    await repository.getMediaByPaths('org-1', [
      'https://media/a',
      'https://media/b',
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        path: { in: ['https://media/a', 'https://media/b'] },
        deletedAt: null,
      },
      select: { id: true, path: true },
    });
  });
});

// The public API's media list and Samy's media tool both read this query with
// three arguments, and both must answer exactly what they answer today while
// the media library gets its own query beside it (spec 057, Rule 3, FR-055,
// FR-056, SC-008). The model holds only the two spies, so any other call on it
// throws.
describe('MediaRepository.getMedia, as the public API and Samy read it', () => {
  const rows = [
    {
      id: 'media-1',
      name: 'logo.png',
      originalName: 'logo.png',
      path: 'https://media/logo.png',
      thumbnail: null,
      alt: null,
      thumbnailTimestamp: null,
      createdAt: new Date('2026-11-10T12:00:00.000Z'),
    },
  ];

  const build = (total = 0) => {
    const count = jest.fn().mockResolvedValue(total);
    const findMany = jest.fn().mockResolvedValue(rows);
    const repository = new MediaRepository({
      model: { media: { count, findMany } },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);
    return { repository, count, findMany };
  };

  const todaysCalls = (search: object, skip: number) => ({
    count: [
      [
        {
          where: {
            organization: { id: 'org-1' },
            deletedAt: null,
            status: { not: 'processing' },
            ...search,
          },
        },
      ],
    ],
    findMany: [
      [
        {
          where: {
            organizationId: 'org-1',
            deletedAt: null,
            status: { not: 'processing' },
            ...search,
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            originalName: true,
            path: true,
            thumbnail: true,
            alt: true,
            thumbnailTimestamp: true,
            createdAt: true,
          },
          skip,
          take: 32,
        },
      ],
    ],
  });

  it('counts and reads the live, ready rows of the organization, 32 a page, newest first', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 2, 'logo');

    const expected = todaysCalls(
      { originalName: { contains: 'logo', mode: 'insensitive' } },
      32
    );
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('adds no search and reads the first page when neither is given', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia(
      'org-1',
      undefined as unknown as number,
      undefined
    );

    const expected = todaysCalls({}, 0);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('adds no search for a blank one', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 1, '   ');

    const expected = todaysCalls({}, 0);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('searches the trimmed words', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 3, '  logo ');

    const expected = todaysCalls(
      { originalName: { contains: 'logo', mode: 'insensitive' } },
      64
    );
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('answers the page count and the rows as the model returned them', async () => {
    const { repository } = build(65);

    const answer = await repository.getMedia('org-1', 1, undefined);

    expect(answer).toStrictEqual({ pages: 3, results: rows });
    expect(answer.results).toBe(rows);
  });
});
