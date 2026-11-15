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

// Every key at any depth of a query's where. The Media library reads a file's
// type off its address, as the tile does (hasExtension), so no where may name
// the type column (image on every row) or fileSize (spec 057, Rule 7).
const keysOf = (value: unknown): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)])
    : [];

const expectNoColumnType = (calls: unknown[][]) => {
  for (const [{ where }] of calls as [{ where: object }][]) {
    expect(keysOf(where)).not.toContain('type');
    expect(keysOf(where)).not.toContain('fileSize');
  }
};

const insensitive = (ending: string) => ({
  path: { contains: ending, mode: 'insensitive' },
});

// The Media library reads the same query with a fourth argument: the type
// filter goes into the page and its count alike, and rows with the same
// timestamp keep one order between loads (spec 057, research R9, R10, FR-008,
// FR-021 to FR-024, Rules 3, 7).
describe('MediaRepository.getMedia, as the Media library reads it', () => {
  const build = () => {
    const count = jest.fn().mockResolvedValue(0);
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new MediaRepository({
      model: { media: { count, findMany } },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);
    return { repository, count, findMany };
  };

  const libraryCalls = (
    filter: object,
    order: 'asc' | 'desc',
    skip: number
  ) => ({
    count: [
      [
        {
          where: {
            organization: { id: 'org-1' },
            deletedAt: null,
            status: { not: 'processing' },
            ...filter,
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
            ...filter,
          },
          orderBy: [{ createdAt: order }, { id: order }],
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

  it('reads videos only, by .mp4 in the address in any case, beside the search', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 2, ' logo ', { type: 'video' });

    const expected = libraryCalls(
      {
        originalName: { contains: 'logo', mode: 'insensitive' },
        ...insensitive('.mp4'),
      },
      'desc',
      32
    );
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('reads every file but the videos for images, GIFs among them', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 1, undefined, { type: 'image' });

    const expected = libraryCalls({ NOT: insensitive('.mp4') }, 'desc', 0);
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('reads JPEG and PNG pictures only for still images, no GIF', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 1, undefined, { type: 'image-static' });

    const expected = libraryCalls(
      { OR: ['.jpg', '.jpeg', '.png'].map(insensitive) },
      'desc',
      0
    );
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('reads every file newest first, ties broken by id, when no type or sort is given', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 1, undefined, {});

    const expected = libraryCalls({}, 'desc', 0);
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('reads newest first, ties broken by id, for newest', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 1, undefined, { sort: 'newest' });

    const expected = libraryCalls({}, 'desc', 0);
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });

  it('reads oldest first, ties broken by id, for oldest', async () => {
    const { repository, count, findMany } = build();

    await repository.getMedia('org-1', 3, undefined, {
      type: 'video',
      sort: 'oldest',
    });

    const expected = libraryCalls(insensitive('.mp4'), 'asc', 64);
    expectNoColumnType([...count.mock.calls, ...findMany.mock.calls]);
    expect(count.mock.calls).toStrictEqual(expected.count);
    expect(findMany.mock.calls).toStrictEqual(expected.findMany);
  });
});

// A month heading counts its files, and its "Select all" reads their ids,
// under the list's own filters, so the number and the selection match what
// the month shows (spec 057, research R4, R5, FR-002, FR-008, FR-021, FR-039,
// Rule 6).
describe('MediaRepository.countMediaInRange and getMediaIdsInRange, a month of the Media library', () => {
  const from = '2026-11-01T04:00:00.000Z';
  const to = '2026-12-01T05:00:00.000Z';

  const monthWhere = (filter: object) => ({
    organizationId: 'org-1',
    deletedAt: null,
    status: { not: 'processing' },
    ...filter,
    createdAt: { gte: new Date(from), lt: new Date(to) },
  });

  const build = (media: object) =>
    new MediaRepository({
      model: { media },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);

  it('counts the month in one count, under the search and the type, and answers the number', async () => {
    const count = jest.fn().mockResolvedValue(23);
    const repository = build({ count });

    const answer = await repository.countMediaInRange('org-1', {
      from,
      to,
      search: ' logo ',
      type: 'video',
    });

    expectNoColumnType(count.mock.calls);
    expect(count.mock.calls).toStrictEqual([
      [
        {
          where: monthWhere({
            originalName: { contains: 'logo', mode: 'insensitive' },
            ...insensitive('.mp4'),
          }),
        },
      ],
    ]);
    expect(answer).toBe(23);
  });

  it('counts every file of the month when neither a search nor a type is given', async () => {
    const count = jest.fn().mockResolvedValue(4);
    const repository = build({ count });

    const answer = await repository.countMediaInRange('org-1', { from, to });

    expect(count.mock.calls).toStrictEqual([[{ where: monthWhere({}) }]]);
    expect(answer).toBe(4);
  });

  it('reads the month ids in one findMany with the same where, and answers the ids', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);
    const repository = build({ findMany });

    const answer = await repository.getMediaIdsInRange('org-1', {
      from,
      to,
      search: 'logo',
      type: 'image-static',
    });

    expectNoColumnType(findMany.mock.calls);
    expect(findMany.mock.calls).toStrictEqual([
      [
        {
          where: monthWhere({
            originalName: { contains: 'logo', mode: 'insensitive' },
            OR: ['.jpg', '.jpeg', '.png'].map(insensitive),
          }),
          select: { id: true },
        },
      ],
    ]);
    expect(answer).toStrictEqual(['media-1', 'media-2']);
  });
});

// Deleting a selection is one statement per batch, scoped to the asking
// organization's live rows: another workspace's id matches nothing, and a file
// another tab already deleted is not stamped again. Nothing leaves storage and
// nothing comes back (spec 057, research R6, FR-039, FR-040, FR-057, Rule 12).
describe('MediaRepository.deleteManyMedia', () => {
  it('stamps the live rows of the ids deleted in one updateMany, and answers nothing', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const repository = new MediaRepository({
      model: { media: { updateMany } },
    } as unknown as ConstructorParameters<typeof MediaRepository>[0]);

    const answer = await repository.deleteManyMedia('org-1', ['a', 'b']);

    expect(updateMany.mock.calls).toStrictEqual([
      [
        {
          where: {
            organizationId: 'org-1',
            id: { in: ['a', 'b'] },
            deletedAt: null,
          },
          data: { deletedAt: expect.any(Date) },
        },
      ],
    ]);
    expect(answer).toBeUndefined();
  });
});
