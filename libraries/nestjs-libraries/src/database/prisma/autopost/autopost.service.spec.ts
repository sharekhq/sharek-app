import type { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

// Keep the module import hermetic: the ChatOpenAI stub only has to satisfy the
// structured-output prompt chain in generatePicture (LangChain coerces the
// returned function into a Runnable), and the NestJS dependencies are
// constructor metadata only — generatePicture never touches them.
const mockChatOpenAIFields: any[] = [];
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(fields: any) {
      mockChatOpenAIFields.push(fields);
    }
    withStructuredOutput() {
      return async () => ({
        generatedTextToBeSentToDallE: 'a pomegranate on a desk',
      });
    }
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository',
  () => ({ AutopostRepository: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { AutopostService } from './autopost.service';

describe('AutopostService.generatePicture', () => {
  it('uploads the generated image and registers it in the media library', async () => {
    const openai = { generateImage: jest.fn().mockResolvedValue('B64DATA') };
    // Mirrors the select subset media.repository saveFile actually returns
    // (no organizationId or timestamps).
    const mediaRow = {
      id: 'media-1',
      name: 'abc.png',
      path: 'https://uploads.example.com/2026/07/abc.png',
    };
    const media = { saveFile: jest.fn().mockResolvedValue(mediaRow) };
    const service = new AutopostService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      openai as unknown as OpenaiService,
      media as any
    );
    const storage = {
      uploadSimple: jest
        .fn()
        .mockResolvedValue('https://uploads.example.com/2026/07/abc.png'),
    };
    (service as any).storage = storage;

    const state: any = await service.generatePicture({
      body: { organizationId: 'org-1' },
      load: { description: 'New article about pomegranates' },
    } as any);

    expect(openai.generateImage).toHaveBeenCalledWith(
      'a pomegranate on a desk'
    );
    expect(storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/png;base64,B64DATA'
    );
    expect(media.saveFile).toHaveBeenCalledWith(
      'org-1',
      'abc.png',
      'https://uploads.example.com/2026/07/abc.png'
    );
    expect(state.image).toBe(mediaRow);
  });
});

describe('AutopostService.schedulePost', () => {
  it('attaches the registered media row to the drafted post', async () => {
    const postsService = {
      findFreeDateTime: jest.fn().mockResolvedValue('2026-07-27T10:00:00'),
      createPost: jest.fn().mockResolvedValue([]),
    };
    const service = new AutopostService(
      {} as any,
      {} as any,
      {} as any,
      postsService as any,
      {} as any,
      {} as any
    );

    await service.schedulePost({
      description: 'Fresh article',
      load: { url: 'https://blog.example.com/a' },
      image: {
        id: 'media-1',
        name: 'abc.png',
        path: 'https://uploads.example.com/2026/07/abc.png',
      },
      integrations: [
        { id: 'int-1', providerIdentifier: 'x', organizationId: 'org-1' },
      ],
    } as any);

    const dto = postsService.createPost.mock.calls[0][1];
    expect(dto.posts[0].value[0].image).toEqual([
      {
        id: 'media-1',
        name: 'abc.png',
        path: 'https://uploads.example.com/2026/07/abc.png',
        organizationId: 'org-1',
      },
    ]);
  });
});

// Same contract as the post generator: gpt-5.x 400s on a non-default
// temperature, and reasoning is configured through `reasoning.effort` rather
// than the deprecated call-option-only `reasoningEffort`. This graph binds no
// tools, so 'none' here is purely about not paying for reasoning tokens — they
// bill as output, and gpt-5.6 defaults to 'medium'.
describe('AutopostService model', () => {
  it('runs gpt-5.6-luna with reasoning off and no temperature', () => {
    expect(mockChatOpenAIFields).toHaveLength(1);
    const [fields] = mockChatOpenAIFields;
    expect(fields.model).toBe('gpt-5.6-luna');
    expect(fields.reasoning).toEqual({ effort: 'none' });
    expect(fields).not.toHaveProperty('temperature');
  });
});
