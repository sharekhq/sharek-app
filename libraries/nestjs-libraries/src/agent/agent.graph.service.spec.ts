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

import { HttpException } from '@nestjs/common';
import { AgentGraphService } from './agent.graph.service';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

describe('AgentGraphService.generatePictures', () => {
  // The wizard used to call the raw generator, so a thread of images cost the
  // customer nothing and told billing nothing. Going through MediaService is
  // what makes each one checked and recorded like every other surface.
  const media = { generateImage: jest.fn() };
  const service = new AgentGraphService({} as any, media as any);

  const org = { id: 'org-1' } as any;

  afterEach(() => jest.clearAllMocks());

  it('returns no update when pictures are off', async () => {
    expect(
      await service.generatePictures({ isPicture: false } as any, org)
    ).toEqual({});
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('generates a gpt-image data URL for every content item', async () => {
    media.generateImage
      .mockResolvedValueOnce('FIRSTB64')
      .mockResolvedValueOnce('SECONDB64');

    const result: any = await service.generatePictures(
      {
        isPicture: true,
        content: [
          { content: 'post 1', prompt: 'a red pomegranate' },
          { content: 'post 2', prompt: 'a calendar with posts' },
        ],
      } as any,
      org
    );

    expect(media.generateImage).toHaveBeenCalledTimes(2);
    expect(media.generateImage).toHaveBeenCalledWith('a red pomegranate', org);
    expect(media.generateImage).toHaveBeenCalledWith('a calendar with posts', org);
    expect(result.content[0].image).toBe('data:image/png;base64,FIRSTB64');
    expect(result.content[1].image).toBe('data:image/png;base64,SECONDB64');
  });

  // `streamMode: 'values'` emits the full state after every node and
  // posts.controller writes those frames to the client verbatim, so an org in
  // state would hand any member running the wizard the apiKey, the paymentId
  // and the subscription row.
  it('keeps the organization out of the state it returns', async () => {
    media.generateImage.mockResolvedValue('B64');

    const result = await service.generatePictures(
      {
        isPicture: true,
        content: [{ content: 'post 1', prompt: 'a red pomegranate' }],
      } as any,
      { id: 'org-1', apiKey: 'sk-secret', paymentId: 'cus_leak' } as any
    );

    expect(JSON.stringify(result)).not.toContain('sk-secret');
    expect(JSON.stringify(result)).not.toContain('cus_leak');
  });

  it('does not flag a run where nothing was skipped', async () => {
    media.generateImage.mockResolvedValue('B64');

    const result: any = await service.generatePictures(
      {
        isPicture: true,
        content: [{ content: 'post 1', prompt: 'a red pomegranate' }],
      } as any,
      org
    );

    expect(result.imagesSkipped).toBeUndefined();
  });

  // Enforcement without this turns a working feature into a hard failure: the
  // posts are the wizard's actual output, and they are still worth having
  // without their pictures. The flag rides the final state to the client, which
  // already renders an imageless item as text — all it needs is the reason.
  describe('when the image allowance runs out', () => {
    const refusal = () =>
      new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.IMAGES_PER_MONTH,
      });

    it('delivers the item without an image and flags the run', async () => {
      media.generateImage.mockRejectedValue(refusal());

      const result: any = await service.generatePictures(
        {
          isPicture: true,
          content: [{ content: 'post 1', prompt: 'a red pomegranate' }],
        } as any,
        org
      );

      expect(result.content[0].content).toBe('post 1');
      expect(result.content[0].image).toBeUndefined();
      expect(result.imagesSkipped).toBe(true);
    });

    // Credits can run out partway through a thread. Whatever was covered keeps
    // its picture — refusing the whole batch would throw away images the
    // customer already paid for.
    it('keeps the images it did cover', async () => {
      media.generateImage
        .mockResolvedValueOnce('FIRSTB64')
        .mockRejectedValueOnce(refusal());

      const result: any = await service.generatePictures(
        {
          isPicture: true,
          content: [
            { content: 'post 1', prompt: 'a red pomegranate' },
            { content: 'post 2', prompt: 'a calendar with posts' },
          ],
        } as any,
        org
      );

      expect(result.content[0].image).toBe('data:image/png;base64,FIRSTB64');
      expect(result.content[1].image).toBeUndefined();
      expect(result.imagesSkipped).toBe(true);
    });

    // A safety rejection or a provider outage is not a degraded run — it is a
    // failed one, and it must keep failing the node the way it does today.
    it('still fails the run for anything that is not a credit refusal', async () => {
      media.generateImage.mockRejectedValue(new Error('socket hang up'));

      const err = await service
        .generatePictures(
          {
            isPicture: true,
            content: [{ content: 'post 1', prompt: 'a red pomegranate' }],
          } as any,
          org
        )
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(500);
    });
  });
});

// These two nodes write the copy behind the calendar's "generate posts" button.
// Upstream pins them to English ("Use simple english"), which renders English
// posts for an Arabic-first product — and gpt-5.x follows instructions more
// literally than gpt-4.1 did. The rule has to stay gone across upstream merges.
describe('AgentGraphService prompt language', () => {
  const service = new AgentGraphService({} as any, {} as any);

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
