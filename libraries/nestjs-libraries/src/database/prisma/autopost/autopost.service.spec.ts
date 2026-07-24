import type { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

// Keep the module import hermetic: the ChatOpenAI stub only has to satisfy the
// structured-output prompt chain in generatePicture (LangChain coerces the
// returned function into a Runnable), and the NestJS dependencies are
// constructor metadata only — generatePicture never touches them.
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
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
jest.mock('nestjs-temporal-core', () => ({ TemporalService: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import { AutopostService } from './autopost.service';

describe('AutopostService.generatePicture', () => {
  it('uploads the generated image and stores the hosted URL, not an OpenAI link', async () => {
    const openai = { generateImage: jest.fn().mockResolvedValue('B64DATA') };
    const service = new AutopostService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      openai as unknown as OpenaiService
    );
    const storage = {
      uploadSimple: jest
        .fn()
        .mockResolvedValue('https://uploads.example.com/2026/07/abc.png'),
    };
    (service as any).storage = storage;

    const state: any = await service.generatePicture({
      load: { description: 'New article about pomegranates' },
    } as any);

    expect(openai.generateImage).toHaveBeenCalledWith(
      'a pomegranate on a desk'
    );
    expect(storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/png;base64,B64DATA'
    );
    expect(state.image).toBe('https://uploads.example.com/2026/07/abc.png');
  });
});
