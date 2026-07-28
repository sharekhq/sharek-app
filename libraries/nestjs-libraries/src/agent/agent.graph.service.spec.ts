import type { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

// Keep the module import hermetic: no real LangChain clients, no storage SDKs,
// and none of the heavy service dependency chains (they are constructor
// metadata only — generatePictures never touches them).
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    withStructuredOutput() {
      return {};
    }
  },
}));

// Capture every prompt template the graph builds, so the Arabic-language guard
// below can assert on the text itself. `mock` prefix: jest.mock factories are
// hoisted above const declarations and may only close over names so prefixed.
const mockTemplates: string[] = [];
jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromTemplate: (template: string) => {
      mockTemplates.push(template);
      return { pipe: () => ({ invoke: async () => ({}) }) };
    },
  },
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

// These two nodes write the copy behind the calendar's "generate posts" button.
// Upstream pins them to English ("Use simple english"), which renders English
// posts for an Arabic-first product — and gpt-5.x follows instructions more
// literally than gpt-4.1 did. The rule has to stay gone across upstream merges.
describe('AgentGraphService prompt language', () => {
  const service = new AgentGraphService({} as any, {} as any, {} as any);

  beforeEach(() => {
    mockTemplates.length = 0;
  });

  const state = {
    tone: 'personal',
    format: 'one_short',
    messages: [{ content: 'اكتب لي منشورًا' }],
    popularPosts: [{ content: 'c', hook: 'h' }],
  } as any;

  it('never pins the hook to English', async () => {
    await service.generateHook(state);
    expect(mockTemplates).toHaveLength(1);
    expect(mockTemplates[0]).not.toMatch(/english/i);
    expect(mockTemplates[0]).toMatch(/same language as the user/i);
  });

  it('never pins the content to English', async () => {
    await service.generateContent(state);
    expect(mockTemplates).toHaveLength(1);
    expect(mockTemplates[0]).not.toMatch(/english/i);
    expect(mockTemplates[0]).toMatch(/same language as the user/i);
  });
});
