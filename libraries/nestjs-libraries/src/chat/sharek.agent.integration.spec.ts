process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';
import { createTool } from '@mastra/core/tools';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  CopilotRuntime,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';
import { getSharekAgents, logRunError, messagesToSend } from './sharek.agent';

// Drives a real Mastra agent against an in-memory store to prove two claims:
// the thread stops being re-saved on every turn (Tier 3), and a Samy run that
// fails is logged once it goes through the real CopilotKit runtime. Runs only
// under jest.integration.config.ts — see that file for why.

const stubModel: any = {
  specificationVersion: 'v2',
  provider: 'stub',
  modelId: 'stub',
  supportedUrls: {},
  async doStream() {
    return {
      stream: new ReadableStream({
        start(c) {
          c.enqueue({ type: 'stream-start', warnings: [] });
          c.enqueue({ type: 'text-start', id: '0' });
          c.enqueue({ type: 'text-delta', id: '0', delta: 'reply' });
          c.enqueue({ type: 'text-end', id: '0' });
          c.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          });
          c.close();
        },
      }),
      request: {},
      response: {},
    };
  },
  async doGenerate() {
    return {
      content: [{ type: 'text', text: 'reply' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    };
  },
};

const TURNS = 6;
const REAL_MESSAGES = TURNS * 2; // one user and one assistant per turn

const storedRowsAfterTurns = async (useSlice: boolean) => {
  const agent = new Agent({
    id: 'a',
    name: 'a',
    instructions: () => 'SYSTEM',
    model: stubModel,
    tools: {},
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { generateTitle: false, lastMessages: 20 },
    }),
  } as any);

  // mirrors CopilotKit, which resends its whole message list every turn
  const clientThread: any[] = [];
  for (let n = 1; n <= TURNS; n++) {
    clientThread.push({ role: 'user', content: `message ${n}` });
    const sent = useSlice
      ? messagesToSend(clientThread.slice() as any)
      : clientThread.slice();

    const res = await agent.stream(sent as any, {
      memory: { thread: 'T', resource: 'R' },
    } as any);
    for await (const _ of res.fullStream as any) {
      /* drain */
    }
    await new Promise((r) => setTimeout(r, 250));

    clientThread.push({
      role: 'assistant',
      content: [{ type: 'text', text: 'reply' }],
    });
  }

  const memory = await agent.getMemory();
  const stored = await memory!.recall({
    threadId: 'T',
    resourceId: 'R',
    perPage: 500,
  });
  return stored.messages.length;
};

describe('Samy conversation storage', () => {
  it('stores exactly one row per message when only the newest exchange is sent', async () => {
    expect(await storedRowsAfterTurns(true)).toBe(REAL_MESSAGES);
  }, 30000);

  // The behaviour this replaced. Production reached 368 rows for 78 real
  // messages; if this ever stops being far worse, the comparison is broken.
  it('re-appends the whole thread when the client list is sent verbatim', async () => {
    expect(await storedRowsAfterTurns(false)).toBeGreaterThan(REAL_MESSAGES * 2);
  }, 30000);
});

// A model call that fails, as an upstream outage would.
const failingModel: any = {
  ...stubModel,
  async doStream() {
    throw new Error('model unavailable');
  },
};

// Sends one Samy run through CopilotKit's real endpoint, as the browser does,
// and reads the response to its end.
const runThroughCopilotKit = async (threadId: string) => {
  const agent = new Agent({
    id: 'sharek',
    name: 'Sharek',
    instructions: () => 'SYSTEM',
    model: failingModel,
    tools: {},
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { generateTitle: false, lastMessages: 20 },
    }),
  } as any);
  const mastra = new Mastra({ agents: { postiz: agent }, logger: false });
  const runtime = new CopilotRuntime({
    agents: getSharekAgents({ mastra, resourceId: 'org-1' }),
    onError: (event) => logRunError(event, 'org-1'),
  });
  const endpoint = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilot/agent',
    runtime,
  }) as unknown as (request: Request) => Promise<Response>;

  const response = await endpoint(
    new Request('http://localhost/copilot/agent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'agent/run',
        params: { agentId: 'postiz' },
        body: {
          threadId,
          runId: 'run-1',
          messages: [{ id: 'message-1', role: 'user', content: 'hi' }],
          state: {},
          tools: [],
          context: [],
          forwardedProps: {},
        },
      }),
    })
  );
  await response.text();
};

describe('Samy run errors', () => {
  let logged: { context: string; message: string }[];
  let spy: jest.SpyInstance;

  // @ag-ui/client prints the failure to console.error too; only Samy's own
  // line is read, and the rest stays out of the test output.
  beforeEach(() => {
    logged = [];
    spy = jest
      .spyOn(console, 'error')
      .mockImplementation((context?: any, message?: any) =>
        logged.push({ context, message: String(message) })
      );
  });

  afterEach(() => spy.mockRestore());

  // CopilotKit sends a failed run's error to the browser, where the chat shows
  // nothing; the runtime's onError is the only place the server sees it.
  it('logs a failed run, with its thread and run, through the real CopilotKit runtime', async () => {
    await runThroughCopilotKit('thread-failing');

    const lines = logged.filter((line) => line.context === 'SamyRunError');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].message)).toMatchObject({
      org: 'org-1',
      thread: 'thread-failing',
      run: 'run-1',
    });
    expect(JSON.parse(lines[0].message).error).toContain('model unavailable');
  }, 30000);
});

// A body as OpenAI's Responses API streams it, so the real provider turns it into
// the chunks production gets.
const responsesBody = (events: object[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        [
          {
            type: 'response.created',
            response: { id: 'resp_1', created_at: 0, model: 'gpt-5.6-luna' },
          },
          ...events,
          {
            type: 'response.completed',
            response: {
              incomplete_details: null,
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
            },
          },
        ].forEach((event) =>
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        );
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

const functionCall = (index: number) => {
  const args = JSON.stringify({ prompt: `picture ${index}` });
  const item = {
    type: 'function_call',
    id: `fc_${index}`,
    call_id: `call_${index}`,
    name: 'generateImageTool',
  };
  return [
    {
      type: 'response.output_item.added',
      output_index: index,
      item: { ...item, arguments: '', status: 'in_progress' },
    },
    {
      type: 'response.function_call_arguments.delta',
      item_id: item.id,
      output_index: index,
      delta: args,
    },
    {
      type: 'response.output_item.done',
      output_index: index,
      item: { ...item, arguments: args, status: 'completed' },
    },
  ];
};

const words = (text: string) => [
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { type: 'message', id: 'msg_1' },
  },
  {
    type: 'response.output_text.delta',
    item_id: 'msg_1',
    delta: text,
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: { type: 'message', id: 'msg_1' },
  },
];

// The AG-UI events of one Samy run, each handed over as it arrives, the way the
// browser reads them.
const readRun = async (
  response: Response,
  onEvent: (event: { type: string; [key: string]: any }) => void
) => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    pending += decoder.decode(value, { stream: true });
    const frames = pending.split('\n\n');
    pending = frames.pop() ?? '';
    frames
      .filter((frame) => frame.startsWith('data: '))
      .forEach((frame) => onEvent(JSON.parse(frame.slice('data: '.length))));
  }
};

// The real provider, loop and CopilotKit endpoint around a tool that runs until
// it's let go, as a render does. CopilotKit runs a per-request clone of the agent,
// so this also proves what's set here survives that.
const startRenders = (calls: number) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let modelCalls = 0;

  const agent = new Agent({
    id: 'sharek',
    name: 'Sharek',
    instructions: () => 'SYSTEM',
    model: createOpenAI({
      apiKey: 'sk-test',
      fetch: (async () =>
        responsesBody(
          modelCalls++
            ? words('Here it is.')
            : Array.from({ length: calls }, (_, index) =>
                functionCall(index)
              ).flat()
        )) as typeof fetch,
    })('gpt-5.6-luna'),
    tools: {
      generateImageTool: createTool({
        id: 'generateImageTool',
        description: 'Make an image',
        inputSchema: z.object({ prompt: z.string() }),
        execute: async () => {
          await held;
          return { id: 'media-1', path: 'https://media/a.png' };
        },
      }),
    },
    memory: new Memory({
      storage: new InMemoryStore(),
      options: { generateTitle: false, lastMessages: 20 },
    }),
  } as any);
  const mastra = new Mastra({ agents: { postiz: agent }, logger: false });
  const endpoint = copilotRuntimeNodeHttpEndpoint({
    endpoint: '/copilot/agent',
    runtime: new CopilotRuntime({
      agents: getSharekAgents({ mastra, resourceId: 'org-1' }),
    }),
  }) as unknown as (request: Request) => Promise<Response>;

  return {
    release,
    response: endpoint(
      new Request('http://localhost/copilot/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: 'agent/run',
          params: { agentId: 'postiz' },
          body: {
            threadId: `thread-${calls}`,
            runId: 'run-1',
            messages: [{ id: 'message-1', role: 'user', content: 'a picture' }],
            state: {},
            tools: [],
            context: [],
            forwardedProps: {},
          },
        }),
      })
    ),
  };
};

// @ag-ui/mastra holds a server tool's call until its result by default, so the
// page saw nothing until a render had ended, and the waiting card lasted as long
// as the finished picture took to load. Measured on the live stream: all four
// events at 38.8 s.
describe('Samy tells the browser about a tool call while it runs', () => {
  const eventsOf = async (calls: number) => {
    const { release, response } = startRenders(calls);
    const seen: { type: string; [key: string]: any }[] = [];
    let endsWhileRunning = 0;
    let released = false;
    const letGo = () => {
      released = true;
      release();
    };
    // Only so a failure is a failed assertion rather than a test that never ends.
    const fallback = setTimeout(letGo, 3000);

    await readRun(await response, (event) => {
      seen.push(event);
      if (event.type === 'TOOL_CALL_END' && !released) {
        endsWhileRunning++;
        if (endsWhileRunning === calls) {
          letGo();
        }
      }
    });
    clearTimeout(fallback);

    return { seen, endsWhileRunning };
  };

  it('with its arguments, before the tool has finished', async () => {
    const { seen, endsWhileRunning } = await eventsOf(1);

    expect(endsWhileRunning).toBe(1);
    const order = seen
      .map((event) => event.type)
      .filter((type) => type.startsWith('TOOL_CALL_'));
    expect(order).toEqual([
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
    ]);
    expect(seen.find((event) => event.type === 'TOOL_CALL_ARGS')?.delta).toBe(
      JSON.stringify({ prompt: 'picture 0' })
    );
  }, 30000);

  // A row of cards is one message, and each shows as soon as the model asks for it.
  it('for every call of a step, on one message', async () => {
    const { seen, endsWhileRunning } = await eventsOf(4);

    expect(endsWhileRunning).toBe(4);
    const starts = seen.filter((event) => event.type === 'TOOL_CALL_START');
    expect(starts).toHaveLength(4);
    expect(new Set(starts.map((event) => event.parentMessageId)).size).toBe(1);
    expect(
      seen.filter((event) => event.type === 'TOOL_CALL_RESULT')
    ).toHaveLength(4);
  }, 30000);

  it('and still gives the words that follow', async () => {
    const { seen } = await eventsOf(1);

    expect(
      seen
        .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
        .map((event) => event.delta)
        .join('')
    ).toBe('Here it is.');
    expect(seen[seen.length - 1].type).toBe('RUN_FINISHED');
  }, 30000);
});
