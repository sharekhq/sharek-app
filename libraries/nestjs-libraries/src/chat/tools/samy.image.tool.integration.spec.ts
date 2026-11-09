import { Logger } from '@nestjs/common';
import { RequestContext } from '@mastra/core/di';

// The real tool through Mastra's real agent loop, with a stand-in model and media
// service. The limit and the budget both rest on what the loop does with the
// request context: the same one for a step's parallel calls and for later steps,
// and a promise left on it staying a promise. Runs only under
// jest.integration.config.ts, see that file for why.

// load.tools.service imports pStore, which needs DATABASE_URL.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => {
  const { InMemoryStore } = require('@mastra/core/storage');
  return { pStore: new InMemoryStore() };
});
jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [],
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
// The brand repository opens a database client at import.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
);
// samy.image.reader.integration.spec runs the real one.
jest.mock('@gitroom/nestjs-libraries/chat/samy.image.reader', () => ({
  SamyImageReader: class SamyImageReader {
    id = 'samy-image-reader';
    processLLMRequest() {}
    processAPIError() {}
  },
}));

// The image calls the stand-in model makes in each step, then a reply. `mock`
// prefix: jest.mock factories are hoisted above const declarations and may only
// close over names so prefixed.
let mockSteps: number[] = [];
let mockStep = 0;
let mockInput: unknown = { prompt: 'a cat' };

const mockModel: any = {
  specificationVersion: 'v2',
  provider: 'stub',
  modelId: 'stub',
  supportedUrls: {},
  async doStream() {
    const calls = mockSteps[mockStep] ?? 0;
    const step = mockStep++;
    const parts = calls
      ? Array.from({ length: calls }, (_, call) => ({
          type: 'tool-call',
          toolCallId: `call-${step}-${call}`,
          toolName: 'generateImageTool',
          input: JSON.stringify(mockInput),
        }))
      : [
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'Done.' },
          { type: 'text-end', id: 't' },
        ];
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          parts.forEach((part) => controller.enqueue(part));
          controller.enqueue({
            type: 'finish',
            finishReason: calls ? 'tool-calls' : 'stop',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          });
          controller.close();
        },
      }),
      request: {},
      response: {},
    };
  },
  async doGenerate() {
    return {
      content: [{ type: 'text', text: 'Title' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
};
jest.mock('@ai-sdk/openai', () => ({ openai: () => mockModel }));

import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { SamyImageTool } from '@gitroom/nestjs-libraries/chat/tools/samy.image.tool';
import { imageCreditRefusal } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { SamyImageReader } from '@gitroom/nestjs-libraries/chat/samy.image.reader';

const made = { id: 'media-1', path: 'https://media/made.jpg' };
const RESETS_AT = '2026-12-01T00:00:00.000Z';

let thread = 0;

const runTurn = async (steps: number[], credits: number) => {
  mockSteps = steps;
  mockStep = 0;

  const media = {
    generateImageFromLinks: jest.fn().mockResolvedValue(made),
    imageCreditsLeft: jest
      .fn()
      .mockResolvedValue({ credits, resetsAt: RESETS_AT }),
  };
  // No brand, so the images are made as they always were.
  const brands = { resolveForSamy: jest.fn().mockResolvedValue({}) };
  const moduleRef = {
    get: (token: unknown) =>
      token === SamyImageReader
        ? new SamyImageReader()
        : token === SamyImageTool
        ? new SamyImageTool(media as any, brands as any)
        : // A web tool. These runs are about images, so it's left off.
          { available: () => false },
  } as any;

  const agent = await new LoadToolsService(moduleRef).agent();
  const requestContext = new RequestContext();
  requestContext.set(
    'organization' as never,
    JSON.stringify({ id: 'org-1' }) as never
  );
  requestContext.set('ui' as never, 'true' as never);

  const res = await agent.stream('Make images', {
    memory: { thread: `image-thread-${++thread}`, resource: 'org-1' },
    requestContext,
  } as any);

  const results: any[] = [];
  for await (const chunk of res.fullStream as any) {
    if (chunk.type === 'tool-result') {
      results.push(chunk.payload.result);
    }
  }
  const text = await res.text;

  // The thread title is generated in the background; let it finish inside the
  // test rather than after the environment is torn down.
  await new Promise((resolve) => setTimeout(resolve, 250));

  return { media, results, text };
};

const renders = (results: any[]) => results.filter((result) => result.path);
const refusals = (results: any[]) => results.filter((result) => result.error);

describe('Samy image calls through the real loop', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => spy.mockRestore());

  // OpenAI is told every field is required, so the model fills the ones it has no
  // use for. Whatever it fills them with has to mean nothing, not a refusal.
  it.each([
    ['null', { references: null, editOf: null, brand: null }],
    ['empty', { references: [], editOf: '', brand: '' }],
  ])(
    'makes the image when the unused fields come back %s',
    async (_name, unused) => {
      mockInput = { prompt: 'a cat', aspectRatio: 'story', ...unused };

      const { media, results } = await runTurn([1], Infinity);
      mockInput = { prompt: 'a cat' };

      expect(results).toEqual([made]);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(1);
    },
    30000
  );

  it('makes a square when the shape comes back null', async () => {
    mockInput = {
      prompt: 'a cat',
      aspectRatio: null,
      references: null,
      editOf: null,
    };

    const { media, results } = await runTurn([1], Infinity);
    mockInput = { prompt: 'a cat' };

    expect(results).toEqual([made]);
    expect(media.generateImageFromLinks.mock.calls[0][1].aspectRatio).toBe(
      'square'
    );
  }, 30000);

  it('renders 4 of 6 parallel calls in one step', async () => {
    const { media, results, text } = await runTurn([6], Infinity);

    expect(media.generateImageFromLinks).toHaveBeenCalledTimes(4);
    expect(renders(results)).toHaveLength(4);
    expect(refusals(results)).toHaveLength(2);
    expect(refusals(results)[0].error).toMatch(/up to 4/);
    expect(text).toBe('Done.');
  }, 30000);

  it('renders 4 of 6 calls across steps', async () => {
    const { media, results } = await runTurn([3, 3], Infinity);

    expect(media.generateImageFromLinks).toHaveBeenCalledTimes(4);
    expect(renders(results)).toHaveLength(4);
    expect(refusals(results)).toHaveLength(2);
  }, 30000);

  it('renders only what 2 credits pay for, from 3 parallel calls and one read', async () => {
    const { media, results } = await runTurn([3], 2);

    expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
    expect(media.generateImageFromLinks).toHaveBeenCalledTimes(2);
    expect(renders(results)).toHaveLength(2);
    expect(refusals(results)).toEqual([
      { error: imageCreditRefusal(RESETS_AT) },
    ]);
  }, 30000);

  it('keeps the same budget from one step to the next', async () => {
    const { media, results } = await runTurn([1, 1, 1], 2);

    expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
    expect(media.generateImageFromLinks).toHaveBeenCalledTimes(2);
    expect(refusals(results)).toEqual([
      { error: imageCreditRefusal(RESETS_AT) },
    ]);
  }, 30000);
});
