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
  return { toolList: [ScheduleOnePostTool] };
});

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

const runTurn = async (wanted: number) => {
  toolCallsWanted = wanted;
  steps.length = 0;

  const agent = await new LoadToolsService(moduleRef).agent();
  const requestContext = new RequestContext();
  requestContext.set(
    'organization' as never,
    JSON.stringify({ id: 'org-1' }) as never
  );
  requestContext.set('ui' as never, 'true' as never);

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
