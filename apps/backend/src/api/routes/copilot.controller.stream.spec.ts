process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';

// CopilotKit writes a reply as server-sent events while the model produces it,
// so the chat can show it word by word. Here the real /copilot/chat route runs
// on a real HTTP server behind compressResponses(), and the model is held after
// its first words: they have to reach the browser before the rest of the reply
// exists. Samy's /copilot/agent goes through the same CopilotKit endpoint. The
// Mastra side of the controller is swapped for the same shells as
// copilot.controller.chat.spec.
jest.mock('@gitroom/nestjs-libraries/chat/sharek.agent', () => ({
  getSharekAgents: () => ({}),
  logRunError: () => undefined,
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

import express from 'express';
import { IncomingMessage, Server, request } from 'http';
import { AddressInfo } from 'net';
import { createBrotliDecompress, createGunzip } from 'zlib';
import { compressResponses } from '@gitroom/nestjs-libraries/services/compress.responses';
import { CopilotController } from './copilot.controller';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

// What a browser sends, so the server is free to compress.
const ACCEPT_ENCODING = 'gzip, deflate, br';

// The model's reply, stopped after its first words until `held` resolves, as a
// slow model would be halfway through a reply.
const heldReply = (held: Promise<void>) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        const send = (event: object) =>
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        send({
          type: 'response.created',
          response: { id: 'resp_1', created_at: 0, model: 'gpt-5.6-luna' },
        });
        send({
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: 'msg_1' },
        });
        send({
          type: 'response.output_text.delta',
          item_id: 'msg_1',
          delta: 'Your weekend offer',
        });
        await held;
        send({
          type: 'response.output_text.delta',
          item_id: 'msg_1',
          delta: ' starts on Friday.',
        });
        send({
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'message', id: 'msg_1' },
        });
        send({
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
        });
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );

// The response as the browser reads it, whatever encoding the server chose.
const decoded = (res: IncomingMessage) => {
  const encoding = res.headers['content-encoding'];
  if (encoding === 'br') {
    return res.pipe(createBrotliDecompress());
  }
  if (encoding === 'gzip') {
    return res.pipe(createGunzip());
  }
  return res;
};

describe('CopilotController /copilot/chat reply delivery', () => {
  let previous: string | undefined;
  let server: Server;
  let port: number;
  let release: () => void;
  let released: boolean;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test';

    const controller = new CopilotController(
      {} as unknown as ConstructorParameters<typeof CopilotController>[0],
      {} as unknown as ConstructorParameters<typeof CopilotController>[1]
    );
    const app = express();
    // main.ts parses the copilot routes' bodies before CopilotKit sees them.
    app.use(express.json());
    app.use(compressResponses());
    app.post('/copilot/chat', (req, res) => controller.chatAgent(req, res));
    // A JSON answer the size of a page of posts, for the rest of the API.
    app.get('/posts', (_req, res) => {
      res.json({
        posts: Array.from({ length: 50 }, (_, i) => ({
          id: `post-${i}`,
          content: 'Our weekend offer starts on Friday at noon.',
        })),
      });
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  // process.env is shared by every spec file in the worker, so an unset key has
  // to come back unset rather than as the string 'undefined'.
  afterAll(async () => {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  beforeEach(() => {
    released = false;
    const held = new Promise<void>((resolve) => {
      release = () => {
        released = true;
        resolve();
      };
    });
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.href
            : input.url;
        if (url !== RESPONSES_URL) {
          throw new Error(`unexpected request to ${url}`);
        }
        return heldReply(held);
      });
  });

  afterEach(() => fetchSpy.mockRestore());

  // Sends one composer turn as the browser does, lets the model go on as soon
  // as the reply's first words arrive, and notes whether they came while the
  // model was still held.
  const ask = () =>
    new Promise<{ firstWordsWhileWriting: boolean; reply: string }>(
      (resolve, reject) => {
        const body = JSON.stringify({
          method: 'agent/run',
          params: { agentId: 'default' },
          body: {
            threadId: 'thread-1',
            runId: 'run-1',
            state: {},
            forwardedProps: {},
            messages: [
              {
                id: 'u1',
                role: 'user',
                content: 'write about our weekend offer',
              },
            ],
            tools: [],
            context: [],
          },
        });
        const req = request(
          {
            port,
            method: 'POST',
            path: '/copilot/chat',
            headers: {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(body),
              'accept-encoding': ACCEPT_ENCODING,
            },
          },
          (res) => {
            let reply = '';
            let firstWordsWhileWriting = false;
            const stream = decoded(res);
            stream.on('data', (chunk: Buffer) => {
              reply += chunk.toString();
              if (!released && reply.includes('"delta":"Your weekend offer"')) {
                firstWordsWhileWriting = true;
                release();
              }
            });
            stream.on('end', () => resolve({ firstWordsWhileWriting, reply }));
            stream.on('error', reject);
          }
        );
        req.on('error', reject);
        req.end(body);
      }
    );

  it('sends the first words of a reply while the model is still writing the rest', async () => {
    // A reply held back until it is complete would wait on the model forever;
    // let the model finish after three seconds either way, so it fails here.
    const fallback = setTimeout(() => release(), 3000);
    const { firstWordsWhileWriting, reply } = await ask();
    clearTimeout(fallback);

    expect(firstWordsWhileWriting).toBe(true);
    expect(reply).toContain('"delta":" starts on Friday."');
    expect(reply).toContain('"type":"RUN_FINISHED"');
  });

  it('still compresses the rest of the API', async () => {
    const encoding = await new Promise<string | undefined>(
      (resolve, reject) => {
        request(
          {
            port,
            path: '/posts',
            headers: { 'accept-encoding': ACCEPT_ENCODING },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.headers['content-encoding']));
          }
        )
          .on('error', reject)
          .end();
      }
    );

    expect(encoding).toMatch(/^(br|gzip)$/);
  });
});
