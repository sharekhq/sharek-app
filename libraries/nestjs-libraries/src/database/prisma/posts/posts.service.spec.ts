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

const makeService = (
  over: { repository?: any; media?: any; temporal?: any } = {}
) => {
  const repository = over.repository ?? {
    updateImages: jest.fn().mockResolvedValue(undefined),
  };
  const media = over.media ?? { getMediaById: jest.fn() };
  const service = new PostsService(
    repository as any,
    {} as any,
    {} as any,
    media as any,
    {} as any,
    {} as any,
    (over.temporal ?? {}) as any,
    {} as any
  );
  return { service, repository, media };
};

describe('PostsService.updateMedia', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;

  beforeAll(() => {
    process.env.UPLOAD_DIRECTORY = '/uploads';
  });

  afterAll(() => {
    process.env.UPLOAD_DIRECTORY = uploadDirectory;
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

    expect(list.map((m: any) => m.path)).toEqual([
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
  parentPostId: null,
  content: '<p>صباح الخير</p>',
  image: '[]',
  settings: '{"__type":"instagram"}',
  state: 'QUEUE',
  intervalInDays: null,
  tags: [],
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

    expect(result.posts.map((p: any) => p.id)).toEqual(['post-1', 'post-2']);
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

    expect(result.posts.map((p: any) => p.id)).toEqual(['post-1', 'post-2']);
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
