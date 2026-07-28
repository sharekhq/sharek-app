import type { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

// Keep the module import hermetic: no real LangChain clients, no storage SDKs,
// and none of the heavy service dependency chains (they are constructor
// metadata only — generatePictures never touches them).
// Capture what the module-scope `new ChatOpenAI({...})` was constructed with,
// so the model configuration can be asserted without a network call.
const mockChatOpenAIFields: any[] = [];
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(fields: any) {
      mockChatOpenAIFields.push(fields);
    }
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

// gpt-5.x rejects any non-default temperature outright, and @langchain/openai
// forwards the field without stripping it, so a leftover `temperature` is a 400
// on the first request rather than a quality question. Reasoning goes through
// `reasoning.effort` — the flat `reasoningEffort` field is call-options-only and
// deprecated, so setting it here would not typecheck and would not reach OpenAI.
// Effort must be 'none': this graph binds Tavily tools, and OpenAI refuses
// function tools on /v1/chat/completions at any other effort.
describe('AgentGraphService model', () => {
  it('runs gpt-5.6-luna with reasoning off and no temperature', () => {
    expect(mockChatOpenAIFields).toHaveLength(1);
    const [fields] = mockChatOpenAIFields;
    expect(fields.model).toBe('gpt-5.6-luna');
    expect(fields.reasoning).toEqual({ effort: 'none' });
    expect(fields).not.toHaveProperty('temperature');
  });
});
