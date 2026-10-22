// PostsService's constructor deps drag in Prisma, every provider SDK and the
// Temporal client; the methods under test only touch the repository and the
// media service, so the rest are empty shells (same pattern as
// autopost.service.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository',
  () => ({ PostsRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
// Its CJS build requires jsdom, whose ESM tree Jest cannot load (see
// sanitize.post.content.spec); nothing here sanitizes content.
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: jest.fn(), addHook: jest.fn() },
}));

import { PostsService } from './posts.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

type Deps = ConstructorParameters<typeof PostsService>;

const makeService = (
  over: {
    repository?: any;
    media?: any;
    temporal?: any;
    integrationManager?: object;
    integrationService?: object;
    refresh?: object;
  } = {}
) => {
  const repository = over.repository ?? {
    updateImages: jest.fn().mockResolvedValue(undefined),
  };
  const media = over.media ?? { getMediaById: jest.fn() };
  const service = new PostsService(
    repository as any,
    (over.integrationManager ?? {}) as Deps[1],
    (over.integrationService ?? {}) as Deps[2],
    media as any,
    {} as any,
    {} as any,
    (over.temporal ?? {}) as any,
    (over.refresh ?? {}) as Deps[7]
  );
  return { service, repository, media };
};

describe('PostsService.updateMedia', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;

  beforeAll(() => {
    process.env.UPLOAD_DIRECTORY = '/uploads';
  });

  afterAll(() => {
    if (uploadDirectory === undefined) {
      delete process.env.UPLOAD_DIRECTORY;
    } else {
      process.env.UPLOAD_DIRECTORY = uploadDirectory;
    }
  });

  // A path that isn't a remote URL is read straight from the worker's disk
  // when the post publishes, and the post's image list is the user's input.
  it('leaves out a stored path that resolves outside the upload directory', async () => {
    const { service } = makeService();

    const list = await service.updateMedia('post-1', [
      { path: '/2026/10/a.png' },
      { path: '/../../etc/passwd' },
      { path: '/etc/http/../passwd' },
      { path: 'https://cdn.example.com/b.png' },
    ]);

    expect(list.map((m) => m.path)).toEqual([
      '/uploads/2026/10/a.png',
      'https://cdn.example.com/b.png',
    ]);
  });

  it('leaves it out too when the list falls back to what was stored', async () => {
    const { service } = makeService({
      media: { getMediaById: jest.fn().mockRejectedValue(new Error('db')) },
    });

    const list = await service.updateMedia('post-1', [
      { id: 'media-1', path: '/2026/10/a.png' },
      { path: '/../../etc/passwd' },
    ]);

    expect(list).toEqual([{ id: 'media-1', path: '/2026/10/a.png' }]);
  });
});

// The Integration row as Prisma returns it for `include: { integration: true }`,
// credentials included.
const integrationRow = {
  id: 'int-1',
  internalId: 'page-42',
  organizationId: 'org-1',
  name: 'Sharek Café',
  picture: 'https://media.sharek.app/int-1.png',
  providerIdentifier: 'instagram',
  type: 'social',
  profile: 'sharek.cafe',
  token: 'ACCESS-TOKEN',
  refreshToken: 'REFRESH-TOKEN',
  tokenExpiration: new Date('2026-12-01T00:00:00Z'),
  customInstanceDetails: 'INSTANCE-SECRET',
  disabled: false,
  refreshNeeded: false,
  inBetweenSteps: false,
  additionalSettings: '[]',
  postingTimes: '[{"time":120}]',
};

const postRow = (over: Record<string, unknown> = {}) => ({
  id: 'post-1',
  group: 'group-1',
  organizationId: 'org-1',
  integrationId: 'int-1',
  parentPostId: null as string | null,
  content: '<p>صباح الخير</p>',
  image: '[]',
  settings: '{"__type":"instagram"}',
  state: 'QUEUE',
  intervalInDays: null as number | null,
  tags: [] as unknown[],
  ...over,
});

// Any member of the team may open a post in the editor, so what leaves is the
// channel as the editor shows it.
const channelForEditor = {
  id: 'int-1',
  name: 'Sharek Café',
  picture: 'https://media.sharek.app/int-1.png',
  providerIdentifier: 'instagram',
  profile: 'sharek.cafe',
};

const expectNoCredentials = (result: unknown) => {
  const body = JSON.stringify(result);
  expect(body).not.toContain('ACCESS-TOKEN');
  expect(body).not.toContain('REFRESH-TOKEN');
  expect(body).not.toContain('INSTANCE-SECRET');
};

describe('PostsService.getPostsByGroup', () => {
  it('sends the post with its channel trimmed to what the editor shows', async () => {
    const { service } = makeService({
      repository: {
        getPostsByGroup: jest.fn().mockResolvedValue([
          postRow({ integration: integrationRow }),
          postRow({
            id: 'post-2',
            parentPostId: 'post-1',
            content: '<p>والتعليق</p>',
            integration: integrationRow,
          }),
        ]),
      },
    });

    const result = await service.getPostsByGroup('org-1', 'group-1');

    expect(result.posts.map((p) => p.id)).toEqual(['post-1', 'post-2']);
    expect(result.posts[0].integration).toEqual(channelForEditor);
    expect(result.posts[1]).not.toHaveProperty('integration');
    expect(result.integration).toBe('int-1');
    expect(result.integrationPicture).toBe(integrationRow.picture);
    expectNoCredentials(result);
  });
});

describe('PostsService.getPost', () => {
  it('sends the post with its channel trimmed to what the editor shows', async () => {
    const getPost = jest
      .fn()
      .mockResolvedValueOnce(
        postRow({
          integration: integrationRow,
          childrenPost: [postRow({ id: 'post-2', parentPostId: 'post-1' })],
        })
      )
      .mockResolvedValueOnce(
        postRow({ id: 'post-2', parentPostId: 'post-1', childrenPost: [] })
      );
    const { service } = makeService({ repository: { getPost } });

    const result = await service.getPost('org-1', 'post-1');

    expect(result.posts.map((p) => p.id)).toEqual(['post-1', 'post-2']);
    expect(result.posts[0].integration).toEqual(channelForEditor);
    expect(result.integration).toBe('int-1');
    expect(result.integrationPicture).toBe(integrationRow.picture);
    expectNoCredentials(result);
  });
});

describe('PostsService.deletePost', () => {
  // No workflow is running for the post; deleting stops any that is.
  const temporal = {
    client: {
      getRawClient: () => ({ workflow: { list: async function* () {} } }),
    },
  };

  it('answers with the deleted post id', async () => {
    const { service } = makeService({
      repository: {
        deletePost: jest.fn().mockResolvedValue({ id: 'post-1' }),
      },
      temporal,
    });

    expect(await service.deletePost('org-1', 'group-1')).toEqual({
      id: 'post-1',
    });
  });

  it('answers with an error when the group matches no post', async () => {
    const { service } = makeService({
      repository: { deletePost: jest.fn().mockResolvedValue(null) },
      temporal,
    });

    expect(await service.deletePost('org-1', 'group-x')).toEqual({
      error: true,
    });
  });
});

// Another channel of the same organization, as Prisma returns it with
// `include: { integration: true }`. Its secrets contain the markers above, so
// expectNoCredentials covers both channels.
const linkedIntegrationRow = {
  ...integrationRow,
  id: 'int-2',
  internalId: 'urn:li:organization:42',
  name: 'Sharek Café (LinkedIn)',
  picture: 'https://media.sharek.app/int-2.png',
  providerIdentifier: 'linkedin-page',
  profile: 'sharek-cafe',
  token: 'LINKED-ACCESS-TOKEN',
  refreshToken: 'LINKED-REFRESH-TOKEN',
  customInstanceDetails: 'LINKED-INSTANCE-SECRET',
};

// A post of the same batch on another channel, as getPostsByBatch reads it:
// the Post row only, with no channel row.
const linkedRow = (over: Record<string, unknown> = {}) =>
  postRow({
    id: 'post-3',
    group: 'group-2',
    integrationId: 'int-2',
    batchId: 'batch-1',
    settings: '{"__type":"linkedin-page"}',
    ...over,
  });

const openedInBatch = () =>
  jest
    .fn()
    .mockResolvedValue([
      postRow({ batchId: 'batch-1', integration: integrationRow }),
    ]);

describe('PostsService.getPostsByGroup, a post saved for several channels', () => {
  // The editor opens every channel of the batch and any member of the team
  // may open it, so each linked channel leaves as trimmed as the opened one,
  // whatever the repository loads with it.
  it('sends each linked channel trimmed to what the editor shows', async () => {
    const getPostsByBatch = jest.fn().mockResolvedValue([
      linkedRow({ integration: linkedIntegrationRow }),
      linkedRow({
        id: 'post-4',
        parentPostId: 'post-3',
        integration: linkedIntegrationRow,
      }),
    ]);
    const { service } = makeService({
      repository: { getPostsByGroup: openedInBatch(), getPostsByBatch },
    });

    const result = await service.getPostsByGroup('org-1', 'group-1');

    expect(getPostsByBatch).toHaveBeenCalledWith(
      'org-1',
      'batch-1',
      'group-1'
    );
    expect(result.posts[0].integration).toEqual(channelForEditor);
    expect(result.siblings).toHaveLength(1);
    const [linked] = result.siblings;
    expect(linked.group).toBe('group-2');
    expect(linked.integration).toBe('int-2');
    expect(linked.posts.map((p) => p.id)).toEqual(['post-3', 'post-4']);
    expect(linked.posts[0].integration).toEqual({
      id: 'int-2',
      name: 'Sharek Café (LinkedIn)',
      picture: 'https://media.sharek.app/int-2.png',
      providerIdentifier: 'linkedin-page',
      profile: 'sharek-cafe',
    });
    expect(linked.posts[1]).not.toHaveProperty('integration');
    expectNoCredentials(result);
  });

  // Only the channels the post was saved with come along: not the opened
  // channel again, not a channel that repeats on another interval (that is a
  // post of its own), and one post per channel.
  it('leaves out the opened channel, a channel that repeats differently and a second post of one channel', async () => {
    const getPostsByBatch = jest.fn().mockResolvedValue([
      linkedRow(),
      linkedRow({ id: 'post-5', group: 'group-3', integrationId: 'int-1' }),
      linkedRow({
        id: 'post-6',
        group: 'group-4',
        integrationId: 'int-3',
        intervalInDays: 7,
      }),
      linkedRow({ id: 'post-7', group: 'group-5' }),
    ]);
    const { service } = makeService({
      repository: { getPostsByGroup: openedInBatch(), getPostsByBatch },
    });

    const result = await service.getPostsByGroup('org-1', 'group-1');

    expect(result.siblings.map((s) => s.group)).toEqual(['group-2']);
    // read as getPostsByBatch loads it: the channel is known by its id only
    expect(result.siblings[0].integration).toBe('int-2');
    expect(result.siblings[0].posts[0]).not.toHaveProperty('integration');
    expect(result.siblings[0].integrationPicture).toBeUndefined();
  });

  it('opens a post saved before posts were linked alone, without looking for others', async () => {
    const getPostsByBatch = jest.fn();
    const { service } = makeService({
      repository: {
        getPostsByGroup: jest
          .fn()
          .mockResolvedValue([
            postRow({ batchId: null, integration: integrationRow }),
          ]),
        getPostsByBatch,
      },
    });

    const result = await service.getPostsByGroup('org-1', 'group-1');

    expect(getPostsByBatch).not.toHaveBeenCalled();
    expect(result.siblings).toEqual([]);
  });
});

describe('PostsService.createPost, one request for several channels', () => {
  type Body = Parameters<PostsService['createPost']>[1];

  const channelPost = (id: string, date: string) => ({
    integration: { id },
    value: [{ content: '<p>صباح الخير</p>', image: [] as unknown[] }],
    settings: { __type: 'instagram' },
    date,
  });

  const create = async (type: 'schedule' | 'now') => {
    const createOrUpdatePost = jest
      .fn()
      .mockResolvedValue({ posts: [{ id: 'post-1', state: 'QUEUE' }] });
    const { service } = makeService({
      repository: { createOrUpdatePost },
      integrationManager: { getSocialIntegration: () => ({}) },
    });
    jest.spyOn(service, 'startWorkflow').mockResolvedValue(undefined);

    await service.createPost(
      'org-1',
      {
        type,
        shortLink: false,
        date: '2026-11-01T10:00:00',
        tags: [],
        posts: [
          channelPost('int-1', '2026-11-02T09:00:00'),
          channelPost('int-2', '2026-11-03T18:30:00'),
        ],
      } as unknown as Body,
      'WEB'
    );

    return createOrUpdatePost.mock.calls;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  // The link is what lets the editor open every channel the post was saved
  // with; each channel still keeps the date it was given.
  it('links the channels with one batch, each at its own date', async () => {
    const calls = await create('schedule');

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call[2])).toEqual([
      '2026-11-02T09:00:00',
      '2026-11-03T18:30:00',
    ]);
    expect(typeof calls[0][8]).toBe('string');
    expect(calls[0][8]).not.toBe('');
    expect(calls[1][8]).toBe(calls[0][8]);
  });

  it('posts every channel now, whatever date each was given', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 22, 9, 15, 30) });

    const calls = await create('now');

    expect(calls.map((call) => call[2])).toEqual([
      '2026-10-22T09:15:00',
      '2026-10-22T09:15:00',
    ]);
    expect(calls[1][8]).toBe(calls[0][8]);
  });
});

describe('PostsService.updateReleaseId', () => {
  // A TikTok inbox draft, published by the user in the TikTok app and now
  // connected by hand from the calendar.
  const missingPost = (over: Record<string, unknown> = {}) => ({
    id: 'post-1',
    releaseId: 'missing',
    releaseURL: 'https://www.tiktok.com/messages?lang=en#v_inbox_file~v2.1',
    integration: { ...integrationRow, providerIdentifier: 'tiktok' },
    ...over,
  });

  const managerWith = (provider: Record<string, unknown>) => ({
    getSocialIntegration: jest.fn().mockReturnValue(provider),
  });

  it('stores the link the network gives for a post connected by hand', async () => {
    const releaseUrl = jest
      .fn()
      .mockResolvedValue('https://www.tiktok.com/@sharek.cafe/video/7123');
    const updateReleaseId = jest.fn().mockResolvedValue({ id: 'post-1' });
    const { service } = makeService({
      repository: {
        getPostById: jest.fn().mockResolvedValue(missingPost()),
        updateReleaseId,
      },
      integrationManager: managerWith({ releaseUrl }),
    });

    await service.updateReleaseId('org-1', 'post-1', '7123');

    expect(releaseUrl).toHaveBeenCalledWith(
      'ACCESS-TOKEN',
      '7123',
      expect.objectContaining({ id: 'int-1' })
    );
    expect(updateReleaseId).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      '7123',
      'https://www.tiktok.com/@sharek.cafe/video/7123'
    );
  });

  it('still connects the post when its link cannot be fetched', async () => {
    const updateReleaseId = jest.fn().mockResolvedValue({ id: 'post-1' });
    const { service } = makeService({
      repository: {
        getPostById: jest.fn().mockResolvedValue(missingPost()),
        updateReleaseId,
      },
      integrationManager: managerWith({
        releaseUrl: jest.fn().mockRejectedValue(new Error('timeout')),
      }),
    });

    await service.updateReleaseId('org-1', 'post-1', '7123');

    expect(updateReleaseId).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      '7123',
      undefined
    );
  });

  it('asks the network nothing for a post that is not missing', async () => {
    const releaseUrl = jest.fn();
    const updateReleaseId = jest.fn().mockResolvedValue({ id: 'post-1' });
    const { service } = makeService({
      repository: {
        getPostById: jest
          .fn()
          .mockResolvedValue(missingPost({ releaseId: '7000' })),
        updateReleaseId,
      },
      integrationManager: managerWith({ releaseUrl }),
    });

    await service.updateReleaseId('org-1', 'post-1', '7123');

    expect(releaseUrl).not.toHaveBeenCalled();
    expect(updateReleaseId).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      '7123',
      undefined
    );
  });
});

describe('PostsService.getReleaseURL', () => {
  // A TikTok post whose stored id is still the publish id, on a channel whose
  // token has expired: only the network's answer decides whether to refresh.
  const publishedPost = () => ({
    id: 'post-1',
    releaseId: 'v_pub_7123',
    releaseURL: 'https://www.tiktok.com/@sharek.cafe',
    settings: '{}',
    integration: {
      ...integrationRow,
      providerIdentifier: 'tiktok',
      tokenExpiration: new Date('2020-01-01T00:00:00Z'),
    },
  });

  const setup = (resolveReleaseId: jest.Mock, refreshed: unknown) => {
    const refresh = jest.fn().mockResolvedValue(refreshed);
    const { service } = makeService({
      repository: {
        getPostById: jest.fn().mockResolvedValue(publishedPost()),
      },
      integrationManager: {
        getSocialIntegration: () => ({ resolveReleaseId }),
      },
      refresh: { refresh },
    });
    return { service, refresh };
  };

  it('says the post is not out yet without refreshing an expired token', async () => {
    const resolveReleaseId = jest.fn().mockResolvedValue({ pending: true });
    const { service, refresh } = setup(resolveReleaseId, false);

    expect(await service.getReleaseURL('org-1', 'post-1')).toEqual({
      releaseURL: 'https://www.tiktok.com/@sharek.cafe',
      pending: true,
      unavailable: false,
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(resolveReleaseId).toHaveBeenCalledTimes(1);
  });

  it('asks for the channel to be reconnected when the refused token cannot be refreshed', async () => {
    const resolveReleaseId = jest
      .fn()
      .mockRejectedValue(new RefreshToken('tiktok', '{}', ''));
    const { service, refresh } = setup(resolveReleaseId, false);

    expect(await service.getReleaseURL('org-1', 'post-1')).toEqual({
      releaseURL: 'https://www.tiktok.com/@sharek.cafe',
      reconnect: true,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(resolveReleaseId).toHaveBeenCalledTimes(1);
  });
});
