process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { InMemoryStore } from '@mastra/core/storage';
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
