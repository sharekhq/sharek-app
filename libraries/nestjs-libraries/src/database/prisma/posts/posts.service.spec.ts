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

const makeService = (over: { repository?: any; media?: any } = {}) => {
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
    {} as any,
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
