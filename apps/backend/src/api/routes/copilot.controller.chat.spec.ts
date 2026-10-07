process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';

// The composer's assistant runs on the real CopilotKit runtime here: only the
// Mastra side of the controller is swapped for shells (same forms as
// copilot.controller.spec), and the one request that leaves the process, the
// model call, is caught at fetch. What OpenAI would receive is the contract:
// a model that is not retired, no reasoning spent on a composer reply, and the
// editor's tool in reach of a prompt that names it.
jest.mock('@gitroom/nestjs-libraries/chat/sharek.agent', () => ({
  getSharekAgents: () => ({}),
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@mastra/core/di', () => ({
  RequestContext: class {
    private values = new Map<string, unknown>();
    set(key: string, value: unknown) {
      this.values.set(key, value);
    }
    get(key: string) {
      return this.values.get(key);
    }
  },
}));

import { PassThrough } from 'stream';
import { CopilotController } from './copilot.controller';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

const sse = (events: object[]) =>
  events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

// The smallest stream the Responses API can answer: a created and a completed
// event, so the run finishes without the model saying anything.
const emptyResponse = () =>
  new Response(
    sse([
      {
        type: 'response.created',
        response: { id: 'resp_1', created_at: 0, model: 'gpt-5.6-luna' },
      },
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
    ]),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

// setPosts as the editor registers it (new-launch/editor.tsx), in the JSON
// schema form the browser sends.
const setPostsTool = {
  name: 'setPosts',
  description: 'a thread of posts',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        items: { type: 'string' },
        description: 'a thread of posts',
      },
    },
    required: ['content'],
  },
};

const composerRequest = (content: string) => ({
  method: 'POST',
  url: '/copilot/chat',
  headers: { host: 'localhost', 'content-type': 'application/json' },
  socket: {},
  body: {
    method: 'agent/run',
    params: { agentId: 'default' },
    body: {
      threadId: 'thread-1',
      runId: 'run-1',
      state: {},
      forwardedProps: {},
      messages: [{ id: 'u1', role: 'user', content }],
      tools: [setPostsTool],
      context: [] as unknown[],
    },
  },
});

// The controller's own parameter types: importing express's Response would
// shadow the fetch Response the model stub builds.
type ChatAgent = CopilotController['chatAgent'];

const send = async (content: string) => {
  const headers: Record<string, string> = {};
  const res = Object.assign(new PassThrough(), {
    statusCode: 0,
    headers,
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
  });
  let text = '';
  res.on('data', (chunk: Buffer) => (text += chunk.toString()));
  const ended = new Promise((resolve) => res.on('end', resolve));
  await new CopilotController(
    {} as unknown as ConstructorParameters<typeof CopilotController>[0],
    {} as unknown as ConstructorParameters<typeof CopilotController>[1]
  ).chatAgent(
    composerRequest(content) as unknown as Parameters<ChatAgent>[0],
    res as unknown as Parameters<ChatAgent>[1]
  );
  await ended;
  return { status: res.statusCode, text };
};

const hasKey = (value: unknown, key: string): boolean =>
  !!value &&
  typeof value === 'object' &&
  Object.entries(value).some(([k, v]) => k === key || hasKey(v, key));

describe('CopilotController /copilot/chat model request', () => {
  let previous: string | undefined;
  let modelBodies: {
    model: string;
    reasoning: unknown;
    tools: { name: string }[];
    instructions?: unknown;
    input: unknown;
  }[];
  let fetchSpy: jest.SpyInstance;

  beforeAll(() => {
    previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  // process.env is shared by every spec file in the worker, so an unset key has
  // to come back unset rather than as the string 'undefined'.
  afterAll(() => {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  beforeEach(() => {
    modelBodies = [];
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : input.url;
        if (url !== RESPONSES_URL) {
          throw new Error(`unexpected request to ${url}`);
        }
        modelBodies.push(JSON.parse(String(init?.body)));
        return emptyResponse();
      });
  });

  afterEach(() => fetchSpy.mockRestore());

  it('asks gpt-5.6-luna, at reasoning effort none and with no temperature, with setPosts and the composer prompt', async () => {
    const { status } = await send(
      'write a two-post thread about our weekend offer'
    );

    expect(status).toBe(200);
    expect(modelBodies).toHaveLength(1);
    const [body] = modelBodies;
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(hasKey(body, 'temperature')).toBe(false);
    expect(body.tools.map((tool) => tool.name)).toContain('setPosts');

    const prompt = JSON.stringify([body.instructions, body.input]);
    expect(prompt).toContain("AI Assistant in Sharek's post editor");
    expect(prompt).toContain('setPosts');
    expect(prompt).not.toContain('addOrRemovePlatform');
  });
});
