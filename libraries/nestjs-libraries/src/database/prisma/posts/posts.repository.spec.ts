// The repository's constructor takes Prisma's model wrappers, and the real
// module opens a database client at import; only the query shape is under
// test, so each wrapper is a plain object holding spies.
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
}));

import { PostsRepository } from './posts.repository';

type Deps = ConstructorParameters<typeof PostsRepository>;

const repositoryWith = (post: Record<string, jest.Mock>) =>
  new PostsRepository(
    { model: { post } } as unknown as Deps[0],
    {} as Deps[1],
    {} as Deps[2],
    {
      model: { tags: { findMany: jest.fn().mockResolvedValue([]) } },
    } as unknown as Deps[3],
    {
      model: {
        tagsPosts: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      },
    } as unknown as Deps[4],
    {} as Deps[5]
  );

describe('PostsRepository.getPostsByBatch', () => {
  // What it returns reaches the editor of any member of the team: the Post
  // rows only, never the channel row with its tokens.
  it('reads the live posts of the batch on other live channels, without their channel row', async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await repositoryWith({ findMany }).getPostsByBatch(
      'org-1',
      'batch-1',
      'group-1'
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        batchId: 'batch-1',
        group: { not: 'group-1' },
        deletedAt: null,
        integration: { deletedAt: null },
      },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('PostsRepository.createOrUpdatePost, the batch', () => {
  const body = {
    group: 'group-1',
    integration: { id: 'int-1' },
    settings: { __type: 'instagram' },
    value: [{ id: 'post-1', content: '<p>صباح الخير</p>', delay: 0, image: [] }],
  } as unknown as Parameters<PostsRepository['createOrUpdatePost']>[3];

  // First findFirst: the batch lookup; the second: the previous post of the
  // group, read after the upserts.
  const model = (existing: { batchId: string } | null) => ({
    findFirst: jest
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValue({ id: 'post-1' }),
    upsert: jest
      .fn()
      .mockImplementation(({ create }) =>
        Promise.resolve({ id: 'post-1', ...create })
      ),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  });

  it('keeps an edited post in the batch it was saved in, looked up in its organization only', async () => {
    const post = model({ batchId: 'batch-old' });

    await repositoryWith(post).createOrUpdatePost(
      'update',
      'org-1',
      '2026-11-01T10:00:00',
      body,
      [],
      'WEB',
      undefined,
      false,
      'batch-new'
    );

    expect(post.findFirst.mock.calls[0][0]).toEqual({
      where: {
        organizationId: 'org-1',
        deletedAt: null,
        batchId: { not: null },
        OR: [{ group: 'group-1' }, { id: { in: ['post-1'] } }],
      },
      select: { batchId: true },
    });
    expect(post.upsert.mock.calls[0][0].create.batchId).toBe('batch-old');
    expect(post.upsert.mock.calls[0][0].update.batchId).toBe('batch-old');
  });

  it('gives a post with no batch yet the batch of its request', async () => {
    const post = model(null);

    await repositoryWith(post).createOrUpdatePost(
      'draft',
      'org-1',
      '2026-11-01T10:00:00',
      body,
      [],
      'WEB',
      undefined,
      false,
      'batch-new'
    );

    expect(post.upsert.mock.calls[0][0].create.batchId).toBe('batch-new');
  });
});

describe('PostsRepository.updateReleaseId', () => {
  // 'missing' is the marker the public API, the CLI and the missing-post flow
  // read; connecting a post by hand only ever replaces it.
  it('connects only a post still marked missing, with the link it was given', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'post-1' });

    await repositoryWith({ update }).updateReleaseId(
      'post-1',
      'org-1',
      '7123',
      'https://www.tiktok.com/@sharek.cafe/video/7123'
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'post-1', organizationId: 'org-1', releaseId: 'missing' },
      data: {
        releaseId: '7123',
        releaseURL: 'https://www.tiktok.com/@sharek.cafe/video/7123',
      },
    });
  });

  it('keeps the stored link when the network gave none', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'post-1' });

    await repositoryWith({ update }).updateReleaseId('post-1', 'org-1', '7123');

    // toStrictEqual: a releaseURL key holding undefined would fail it
    expect(update.mock.calls[0][0].data).toStrictEqual({ releaseId: '7123' });
  });
});
