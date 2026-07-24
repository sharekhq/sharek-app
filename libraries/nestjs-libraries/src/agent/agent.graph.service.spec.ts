import type { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

// Keep the module import hermetic: no real LangChain clients, no storage SDKs,
// and none of the heavy service dependency chains (they are constructor
// metadata only — generatePictures never touches them).
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {},
}));
jest.mock('@langchain/tavily', () => ({
  TavilySearch: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { AgentGraphService } from './agent.graph.service';

describe('AgentGraphService.generatePictures', () => {
  const openai = { generateImage: jest.fn() };
  const service = new AgentGraphService(
    {} as any,
    {} as any,
    openai as unknown as OpenaiService
  );

  afterEach(() => jest.clearAllMocks());

  it('returns no update when pictures are off', async () => {
    expect(await service.generatePictures({ isPicture: false } as any)).toEqual(
      {}
    );
    expect(openai.generateImage).not.toHaveBeenCalled();
  });

  it('generates a gpt-image data URL for every content item', async () => {
    openai.generateImage
      .mockResolvedValueOnce('FIRSTB64')
      .mockResolvedValueOnce('SECONDB64');

    const result: any = await service.generatePictures({
      isPicture: true,
      content: [
        { content: 'post 1', prompt: 'a red pomegranate' },
        { content: 'post 2', prompt: 'a calendar with posts' },
      ],
    } as any);

    expect(openai.generateImage).toHaveBeenCalledTimes(2);
    expect(openai.generateImage).toHaveBeenCalledWith('a red pomegranate');
    expect(openai.generateImage).toHaveBeenCalledWith('a calendar with posts');
    expect(result.content[0].image).toBe('data:image/png;base64,FIRSTB64');
    expect(result.content[1].image).toBe('data:image/png;base64,SECONDB64');
  });
});
