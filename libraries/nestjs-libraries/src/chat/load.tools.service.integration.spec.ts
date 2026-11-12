import { Logger } from '@nestjs/common';
import { RequestContext } from '@mastra/core/di';

// Drives Samy's real agent configuration through Mastra's real agent loop, with
// a stand-in model and tool. Runs only under jest.integration.config.ts — see
// that file for why.

// load.tools.service imports pStore, which needs DATABASE_URL.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => {
  const { InMemoryStore } = require('@mastra/core/storage');
  return { pStore: new InMemoryStore() };
});

// One tool in place of integrationSchedulePostTool.
jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => {
  const { createTool } = require('@mastra/core/tools');
  const { z } = require('zod');
  class ScheduleOnePostTool {
    name = 'scheduleOnePost';
    run() {
      return createTool({
        id: 'scheduleOnePost',
        description: 'Schedule one post',
        inputSchema: z.object({ post: z.number() }),
        execute: async () => ({ scheduled: true }),
      });
    }
  }
  // The real one, which the outside connections get, as Samy gets the real
  // SamyImageTool in its place. The stand-in model never calls either.
  const {
    GenerateImageTool,
  } = require('@gitroom/nestjs-libraries/chat/tools/generate.image.tool');
  return { toolList: [ScheduleOnePostTool, GenerateImageTool] };
});
// The image tools' services, which they only call when they run.
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
// The brand in use on every Samy turn here, as BrandService picks it.
const mockSummaryForSamy = jest.fn().mockResolvedValue({
  name: 'Hurghada Sea',
  examples: [{ n: 2, path: 'https://media/example-2.jpg' }],
  colours: ['#0A84FF'],
  details: {},
});
// The brand repository opens a database client at import.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({
    BrandService: class {
      summaryForSamy = mockSummaryForSamy;
    },
  })
);
// samy.image.reader.integration.spec runs the real one.
jest.mock('@gitroom/nestjs-libraries/chat/samy.image.reader', () => ({
  SamyImageReader: class SamyImageReader {
    id = 'samy-image-reader';
    processLLMRequest() {}
    processAPIError() {}
  },
}));
// The web tools are the real ones, with nothing behind them: the stand-in model
// never calls them, and firecrawl.service.spec covers Firecrawl.
jest.mock('@gitroom/nestjs-libraries/firecrawl/firecrawl.service', () => ({
  FirecrawlService: class FirecrawlService {},
}));

// Samy's own instructions: every step of a turn carries them, the background
// request for the thread's title does not.
const SAMY = 'You are an agent that helps manage';

const systemText = (request: any) =>
  request.prompt
    .filter((message: any) => message.role === 'system')
    .map((message: any) => message.content)
    .join('\n');

const offersTools = (request: any) =>
  !!request.tools?.length && request.toolChoice?.type !== 'none';

const toolResultsIn = (prompt: any[]) =>
  prompt
    .flatMap((message) => (message.role === 'tool' ? message.content : []))
    .filter((part: any) => part.type === 'tool-result').length;

// How many tool calls the stand-in model makes before it replies.
let toolCallsWanted = 0;
// The request for each step of the turn, in order.
const steps: any[] = [];

// Stands in for gpt-5.6-luna, scheduling one post per call: a tool call per
// step until it has made toolCallsWanted of them, then a reply. A request that
// offers no tools gets the reply straight away, as the real model would have to
// give. `mock` prefix: jest.mock factories are hoisted above const declarations
// and may only close over names so prefixed.
const mockModel: any = {
  specificationVersion: 'v2',
  provider: 'stub',
  modelId: 'stub',
  supportedUrls: {},
  async doStream(options: any) {
    if (systemText(options).includes(SAMY)) {
      steps.push(options);
    }
    const made = toolResultsIn(options.prompt);
    const reply = !offersTools(options) || made >= toolCallsWanted;
    const parts = reply
      ? [
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: 'Done.' },
          { type: 'text-end', id: 't' },
        ]
      : [
          {
            type: 'tool-call',
            toolCallId: `call-${made}`,
            toolName: 'scheduleOnePost',
            input: JSON.stringify({ post: made }),
          },
        ];
    return {
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          parts.forEach((part) => controller.enqueue(part));
          controller.enqueue({
            type: 'finish',
            finishReason: reply ? 'stop' : 'tool-calls',
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

const moduleRef = {
  get: (token: new () => unknown) => new token(),
} as any;

let thread = 0;

const runTurn = async (wanted: number, chat = true) => {
  toolCallsWanted = wanted;
  steps.length = 0;

  const agent = await new LoadToolsService(moduleRef).agent();
  const requestContext = new RequestContext();
  requestContext.set(
    'organization' as never,
    JSON.stringify({ id: 'org-1' }) as never
  );
  if (chat) {
    requestContext.set('ui' as never, 'true' as never);
  }

  const res = await agent.stream('Schedule my posts', {
    memory: { thread: `thread-${++thread}`, resource: 'org-1' },
    requestContext,
  } as any);

  let toolCalls = 0;
  for await (const chunk of res.fullStream as any) {
    if (chunk.type === 'tool-call') {
      toolCalls++;
    }
  }
  const text = await res.text;
  const turnSteps = [...steps];

  // The thread title is generated in the background; let it finish inside the
  // test rather than after the environment is torn down.
  await new Promise((resolve) => setTimeout(resolve, 250));

  return { toolCalls, text, steps: turnSteps };
};

describe('Samy multi-step turns', () => {
  // Each finished turn logs its usage; keep the run's output to the results.
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => spy.mockRestore());

  // Asked for nine posts on two channels, Samy scheduled one date per call and
  // the loop ended the turn after its fifth step, twice, each time right after
  // a tool ran and before Samy said a word.
  it('runs ten tool calls in one turn and still replies', async () => {
    const turn = await runTurn(10);

    expect(turn.toolCalls).toBe(10);
    expect(turn.text).toBe('Done.');
  }, 30000);

  it('ends with a reply when the model would keep calling tools', async () => {
    const turn = await runTurn(Infinity);

    expect(turn.text).toBe('Done.');
    // Bounded: the turn stops at Samy's step limit rather than looping.
    expect(turn.steps).toHaveLength(20);
    expect(turn.toolCalls).toBe(19);
  }, 30000);

  it('switches tools off for the last step only, and says why', async () => {
    const turn = await runTurn(Infinity);
    const last = turn.steps[turn.steps.length - 1];
    const earlier = turn.steps.slice(0, -1);

    expect(offersTools(last)).toBe(false);
    expect(earlier.every(offersTools)).toBe(true);

    // The note is added to Samy's instructions, never in place of them.
    expect(systemText(last)).toContain(SAMY);
    expect(systemText(last)).toContain('what is left');
    expect(
      earlier.some((request) => systemText(request).includes('what is left'))
    ).toBe(false);
  }, 30000);
});

// What a run really offers the model. Over MCP, ask_sharek runs this same agent with
// no ui, so nothing Samy can do with references or a brand reaches an outside
// connection.
describe('The image tool a run offers the model', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => spy.mockRestore());

  const offered = async (chat: boolean) => {
    const turn = await runTurn(0, chat);
    const tool = turn.steps[0].tools.find(
      (entry: any) => entry.name === 'generateImageTool'
    );
    return Object.keys(tool.inputSchema.properties).sort();
  };

  it("in Samy's chat takes references, an image to change, a shape, a brand and its example", async () => {
    expect(await offered(true)).toEqual([
      'aspectRatio',
      'brand',
      'editOf',
      'example',
      'prompt',
      'references',
    ]);
  }, 30000);

  it('with no ui takes a prompt alone', async () => {
    expect(await offered(false)).toEqual(['prompt']);
  }, 30000);

  it('takes a prompt alone with no context, as MCP lists it', async () => {
    const agent = await new LoadToolsService(moduleRef).agent();
    const tools = await agent.listTools();

    expect(Object.keys(tools.generateImageTool.inputSchema.shape)).toEqual([
      'prompt',
    ]);
  });
});

// Samy reads the web in its chat only, while Firecrawl's key is set (specs 052
// and 054), and MCP, which lists the tools with no context, gets what it has
// today.
describe('The web tools a run offers the model', () => {
  const saved = {
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  };
  let spy: jest.SpyInstance;

  beforeEach(() => {
    // Availability is read when the agent is built, so the key comes first.
    process.env.FIRECRAWL_API_KEY = 'fc-test';
    spy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spy.mockRestore();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  const offered = async (chat: boolean) => {
    const turn = await runTurn(0, chat);
    return turn.steps[0].tools.map((entry: any) => entry.name).sort();
  };

  it("in Samy's chat include readWebPageTool and webSearchTool", async () => {
    expect(await offered(true)).toEqual([
      'brandKitTool',
      'generateImageTool',
      'readWebPageTool',
      'scheduleOnePost',
      'webSearchTool',
    ]);
  }, 30000);

  it('with no ui leave them out', async () => {
    expect(await offered(false)).toEqual([
      'generateImageTool',
      'scheduleOnePost',
    ]);
  }, 30000);

  // The Tavily key that brought them before spec 054 brings nothing now.
  it("in Samy's chat with a Tavily key alone leave them out", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    process.env.TAVILY_API_KEY = 'tvly-test';

    expect(await offered(true)).toEqual([
      'brandKitTool',
      'generateImageTool',
      'scheduleOnePost',
    ]);
  }, 30000);

  it('are not listed with no context, as MCP lists them', async () => {
    const agent = await new LoadToolsService(moduleRef).agent();
    const tools = await agent.listTools();

    expect(Object.keys(tools).sort()).toEqual([
      'generateImageTool',
      'scheduleOnePost',
    ]);
  });
});

// Samy knows the brand in use on every turn (spec 056): its instructions end
// with the brand block, and brandKitTool shows it the kit. MCP lists neither
// brandKitTool nor the image tool's example, as the cases above pin.
describe('The brand a run gives the model', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    mockSummaryForSamy.mockClear();
  });

  afterEach(() => spy.mockRestore());

  it("in Samy's chat offers brandKitTool, and the instructions end with the brand block", async () => {
    const turn = await runTurn(0);
    const lines = systemText(turn.steps[0]).trimEnd().split('\n');

    expect(turn.steps[0].tools.map((entry: any) => entry.name)).toContain(
      'brandKitTool'
    );
    expect(lines[lines.length - 1]).toBe(
      '      Brand in use for this chat: "Hurghada Sea". Its kit: no logo; 1 example post, number 2 on the Brands page; colours #0A84FF; no heading font; no body font.'
    );
  }, 30000);

  // Mastra resolves the instructions once per turn and every step reuses them
  // (research R6), so the brand reads don't grow with the steps.
  it('reads the brand once in a two-step turn', async () => {
    const turn = await runTurn(1);

    expect(turn.steps).toHaveLength(2);
    expect(mockSummaryForSamy).toHaveBeenCalledTimes(1);
    expect(systemText(turn.steps[1])).toBe(systemText(turn.steps[0]));
  }, 30000);
});
