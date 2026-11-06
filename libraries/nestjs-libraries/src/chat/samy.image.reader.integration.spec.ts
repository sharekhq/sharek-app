import { Logger } from '@nestjs/common';
import { RequestContext } from '@mastra/core/di';
import { APICallError } from '@ai-sdk/provider';

// The reader through Mastra's real agent loop and memory, with a stand-in model
// and Media lookup. What's proven is what the model gets on each call, and that
// none of it is stored. Runs only under jest.integration.config.ts, see that file
// for why.

// load.tools.service imports pStore, which needs DATABASE_URL.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => {
  const { InMemoryStore } = require('@mastra/core/storage');
  return { pStore: new InMemoryStore() };
});
jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [],
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
// Makes the image named by its prompt, so a test says which link a tool returns.
jest.mock('@gitroom/nestjs-libraries/chat/tools/samy.image.tool', () => {
  const { createTool } = require('@mastra/core/tools');
  const { z } = require('zod');
  class SamyImageTool {
    name = 'generateImageTool';
    run() {
      return createTool({
        id: 'generateImageTool',
        description: 'Make an image',
        inputSchema: z.object({ prompt: z.string() }),
        execute: async ({ prompt }: { prompt: string }) => ({
          id: 'made',
          path: prompt,
        }),
      });
    }
  }
  return { SamyImageTool };
});

// Samy's own instructions: every step of a turn carries them, the background
// request for the thread's title does not.
const SAMY = 'You are an agent that helps manage';

const systemText = (request: any) =>
  request.prompt
    .filter((message: any) => message.role === 'system')
    .map((message: any) => message.content)
    .join('\n');

// What the stand-in model does on each of Samy's calls, in order, then a reply.
type Step = { make: string } | { reject: string } | { failStream: string };

let mockScript: Step[] = [];
const prompts: any[][] = [];

const mockStream = (parts: object[], finishReason: string) => ({
  stream: new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      parts.forEach((part) => controller.enqueue(part));
      controller.enqueue({
        type: 'finish',
        finishReason,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      controller.close();
    },
  }),
  request: {},
  response: {},
});

const mockStubModel: any = {
  specificationVersion: 'v2',
  provider: 'stub',
  modelId: 'stub',
  supportedUrls: {},
  async doStream(options: any) {
    const samy = systemText(options).includes(SAMY);
    if (samy) {
      prompts.push(options.prompt);
    }
    const step = samy ? mockScript.shift() : undefined;

    if (step && 'reject' in step) {
      throw new APICallError({
        message: step.reject,
        url: 'https://api.openai.com/v1/responses',
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
      });
    }
    // The raw frame @ai-sdk/openai hands on when the Responses stream reports a failure.
    if (step && 'failStream' in step) {
      return mockStream(
        [
          {
            type: 'error',
            error: {
              type: 'error',
              code: 'request_failed',
              message: step.failStream,
              sequence_number: 1,
            },
          },
        ],
        'error'
      );
    }
    if (step && 'make' in step) {
      return mockStream(
        [
          {
            type: 'tool-call',
            toolCallId: `call-${prompts.length}`,
            toolName: 'generateImageTool',
            input: JSON.stringify({ prompt: step.make }),
          },
        ],
        'tool-calls'
      );
    }
    return mockStream(
      [
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Done.' },
        { type: 'text-end', id: 't' },
      ],
      'stop'
    );
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

let mockProvider: any = mockStubModel;
jest.mock('@ai-sdk/openai', () => ({ openai: () => mockProvider }));

import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';
import { SamyImageReader } from '@gitroom/nestjs-libraries/chat/samy.image.reader';
import { SamyImageTool } from '@gitroom/nestjs-libraries/chat/tools/samy.image.tool';

const link = (name: string) => `https://media.sharek.app/org-1/${name}`;

// As the chat's input writes it.
const attach = (...links: string[]) =>
  `\n[--Media--]\n${links
    .map((url) => `Image: ${url}`)
    .join('\n')}\n[--Media--]`;

const NOT_THEIRS = link('someone-elses.png');

const media = {
  getMediaByPaths: jest.fn(),
};

const moduleRef = {
  get: (token: any) =>
    token === SamyImageReader
      ? new SamyImageReader(media as any)
      : new SamyImageTool(),
} as any;

let threads = 0;

const runTurn = async (
  words: string,
  thread: string,
  ui: string | null = 'true'
) => {
  const agent = await new LoadToolsService(moduleRef).agent();
  const requestContext = new RequestContext();
  requestContext.set(
    'organization' as never,
    JSON.stringify({ id: 'org-1' }) as never
  );
  if (ui) {
    requestContext.set('ui' as never, ui as never);
  }

  const res = await agent.stream(words, {
    memory: { thread, resource: 'org-1' },
    requestContext,
  } as any);

  const errors: any[] = [];
  for await (const chunk of res.fullStream as any) {
    if (chunk.type === 'error') {
      errors.push(chunk.payload.error);
    }
  }
  const text = await res.text;

  // The thread title is generated in the background; let it finish inside the
  // test rather than after the environment is torn down.
  await new Promise((resolve) => setTimeout(resolve, 250));

  return { agent, text, errors };
};

const newThread = () => `reader-thread-${++threads}`;

const partsOf = (message: any): any[] =>
  Array.isArray(message.content) ? message.content : [];

const allParts = (prompt: any[]) => prompt.flatMap(partsOf);

const picturesIn = (messages: any[]) =>
  messages
    .flatMap(partsOf)
    .filter((part) => part.type === 'file')
    .map((part) => String(part.data));

const textsIn = (prompt: any[]) =>
  allParts(prompt)
    .filter((part) => part.type === 'text')
    .map((part) => part.text as string);

const lastUser = (prompt: any[]) =>
  [...prompt].reverse().find((message) => message.role === 'user');

const noteFor = (prompt: any[], url: string) =>
  textsIn(prompt).find(
    (text) => text.startsWith(`Image ${url}:`) && !text.endsWith(`${url}:`)
  );

const label = (url: string) => ({ type: 'text', text: `Image ${url}:` });

describe('What Samy sees of a chat’s images', () => {
  let logged: jest.SpyInstance;
  let quiet: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockScript = [];
    mockProvider = mockStubModel;
    prompts.length = 0;
    media.getMediaByPaths.mockReset();
    media.getMediaByPaths.mockImplementation(
      async (_org: string, paths: string[]) =>
        paths
          .filter((path) => path !== NOT_THEIRS)
          .map((path) => ({ id: path, path }))
    );
  });

  afterEach(() => {
    logged.mockRestore();
    quiet.mockRestore();
  });

  it('sends an attached image at high detail, after a label with its link, and stores none of it', async () => {
    const first = link('first.png');
    const second = link('second.jpeg');
    const thread = newThread();

    const { agent } = await runTurn(
      `What is in these?${attach(first, second)}`,
      thread
    );

    const parts = partsOf(lastUser(prompts[0]));
    const [firstLabel, firstFile, secondLabel, secondFile] = parts.slice(-4);
    expect(firstLabel).toEqual(label(first));
    expect(String(firstFile.data)).toBe(first);
    expect(firstFile).toEqual(
      expect.objectContaining({
        type: 'file',
        mediaType: 'image/*',
        providerOptions: { openai: { imageDetail: 'high' } },
      })
    );
    expect(firstFile.data).toBeInstanceOf(URL);
    expect(secondLabel).toEqual(label(second));
    expect(String(secondFile.data)).toBe(second);

    const memory = await agent.getMemory();
    const stored = await memory!.recall({
      threadId: thread,
      resourceId: 'org-1',
      perPage: 500,
    });
    const rows = JSON.stringify(stored.messages);
    expect(rows).not.toContain('"file"');
    expect(rows).not.toContain('imageDetail');
    expect(rows).toContain('What is in these?');
  }, 30000);

  it('sends an image made earlier in a new user message, right after its tool result', async () => {
    const made = link('made.png');
    const thread = newThread();
    mockScript = [{ make: made }];

    await runTurn('Make me a cat', thread);
    const sameTurn = prompts[prompts.length - 1];
    await runTurn('Is it wearing a hat?', thread);
    const laterTurn = prompts[prompts.length - 1];

    for (const prompt of [sameTurn, laterTurn]) {
      const tool = prompt.findIndex((message) => message.role === 'tool');
      expect(tool).toBeGreaterThan(-1);
      const next = prompt[tool + 1];
      expect(next.role).toBe('user');
      expect(next.content[0]).toEqual(label(made));
      expect(String(next.content[1].data)).toBe(made);
    }
  }, 30000);

  it('sends the newest 8 images, counting attached and made together', async () => {
    const attached = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => link(`${n}.webp`));
    const made = link('made.png');
    const thread = newThread();
    mockScript = [{ make: made }];

    await runTurn(`Look${attach(...attached)}`, thread);
    await runTurn('And now?', thread);
    const prompt = prompts[prompts.length - 1];

    expect(picturesIn(prompt)).toEqual([...attached.slice(1), made]);
    expect(noteFor(prompt, attached[0])).toMatch(/no longer see/);
    expect(noteFor(prompt, attached[0])).toMatch(/reference/);
  }, 30000);

  it('sends a repeated link once, at its newest position', async () => {
    const again = link('again.png');
    const other = link('other.png');
    const thread = newThread();

    await runTurn(`One${attach(again, other)}`, thread);
    await runTurn(`Two${attach(again)}`, thread);
    const prompt = prompts[prompts.length - 1];

    expect(picturesIn(prompt)).toEqual([other, again]);
    expect(picturesIn([lastUser(prompt)])).toEqual([again]);
  }, 30000);

  it('forgets an image more than 20 messages back, words and picture', async () => {
    const old = link('old.png');
    const thread = newThread();

    await runTurn(`Old one${attach(old)}`, thread);
    for (let turn = 2; turn <= 11; turn++) {
      await runTurn(`Message ${turn}`, thread);
    }
    expect(picturesIn(prompts[prompts.length - 1])).toEqual([old]);

    await runTurn('Message 12', thread);
    const prompt = prompts[prompts.length - 1];

    expect(picturesIn(prompt)).toEqual([]);
    expect(JSON.stringify(prompt)).not.toContain('old.png');
  }, 60000);

  it('never sends a link outside the organization, a GIF or a video, and says so for the images', async () => {
    const mine = link('mine.png');
    const gif = link('moving.gif');
    const video = link('clip.mp4');

    await runTurn(
      `Look\n[--Media--]\nImage: ${mine}\nImage: ${NOT_THEIRS}\nImage: ${gif}\nVideo: ${video}\n[--Media--]`,
      newThread()
    );
    const [prompt] = prompts;

    expect(picturesIn(prompt)).toEqual([mine]);
    expect(noteFor(prompt, NOT_THEIRS)).toMatch(/can't be read or used/);
    expect(noteFor(prompt, gif)).toMatch(/can't see inside/);
    expect(textsIn(prompt).join('\n')).not.toContain(`Image ${video}`);
    // Formats it can't send don't need a lookup.
    expect(media.getMediaByPaths).toHaveBeenCalledWith('org-1', [
      mine,
      NOT_THEIRS,
    ]);
  }, 30000);

  it('asks about each link once in a run, across its steps', async () => {
    const mine = link('mine.png');
    mockScript = [{ make: link('made.png') }];

    await runTurn(`Look${attach(mine)}`, newThread());

    const asked = media.getMediaByPaths.mock.calls.flatMap(
      ([, paths]) => paths
    );
    expect(asked).toEqual([mine, link('made.png')]);
  }, 30000);

  describe('with a dead image', () => {
    const good = link('good.png');
    const dead = link('dead.png');
    const named = `Error while downloading ${dead}.`;

    it.each([
      ['an HTTP 400 up front', { reject: named }],
      ['a failed stream', { failStream: named }],
    ])(
      'replies, says which one, and keeps the good one, after %s',
      async (_name, failure) => {
        const thread = newThread();
        mockScript = [failure];

        const { text, errors, agent } = await runTurn(
          `Look${attach(good, dead)}`,
          thread
        );

        expect(text).toBe('Done.');
        expect(errors).toEqual([]);
        expect(picturesIn(prompts[0])).toEqual([good, dead]);
        expect(picturesIn(prompts[1])).toEqual([good]);
        expect(noteFor(prompts[1], dead)).toMatch(/couldn't be loaded/);

        // SC-007: a dead image costs one failing call a turn, and never a reply.
        for (let later = 1; later <= 3; later++) {
          mockScript = [failure];
          const next = await runTurn(`Later ${later}`, thread);
          expect(next.text).toBe('Done.');
          expect(next.errors).toEqual([]);
        }

        const memory = await agent.getMemory();
        const stored = await memory!.recall({
          threadId: thread,
          resourceId: 'org-1',
          perPage: 500,
        });
        expect(JSON.stringify(stored.messages)).not.toContain('"file"');
      },
      30000
    );

    it('drops every picture when the error names none', async () => {
      mockScript = [{ reject: 'Invalid image.' }];

      const { text } = await runTurn(`Look${attach(good, dead)}`, newThread());

      expect(text).toBe('Done.');
      expect(picturesIn(prompts[1])).toEqual([]);
      expect(noteFor(prompts[1], good)).toMatch(/couldn't be loaded/);
      expect(noteFor(prompts[1], dead)).toMatch(/couldn't be loaded/);
    }, 30000);
  });

  describe('with an error that has nothing to do with images', () => {
    const good = link('good.png');

    it('surfaces a 400 after one retry without the pictures', async () => {
      mockScript = [
        { reject: 'Unknown parameter' },
        { reject: 'Unknown parameter' },
      ];

      const { errors } = await runTurn(`Look${attach(good)}`, newThread());

      expect(prompts).toHaveLength(2);
      expect(picturesIn(prompts[1])).toEqual([]);
      expect(errors[0].message).toBe('Unknown parameter');
    }, 30000);

    it('surfaces a 400 at once when no picture went out', async () => {
      mockScript = [{ reject: 'Unknown parameter' }];

      const { errors } = await runTurn('Hello', newThread());

      expect(prompts).toHaveLength(1);
      expect(errors[0].message).toBe('Unknown parameter');
    }, 30000);

    it('leaves a failed stream alone', async () => {
      mockScript = [{ failStream: 'The server had an error' }];

      const { errors } = await runTurn(`Look${attach(good)}`, newThread());

      expect(prompts).toHaveLength(1);
      expect(errors).toHaveLength(1);
    }, 30000);
  });

  it('still replies when the lookup fails, as text, and logs it', async () => {
    const failure = new Error('database is down');
    media.getMediaByPaths.mockRejectedValue(failure);

    const { text, errors } = await runTurn(
      `Look${attach(link('a.png'))}`,
      newThread()
    );

    expect(text).toBe('Done.');
    expect(errors).toEqual([]);
    expect(picturesIn(prompts[0])).toEqual([]);
    expect(quiet).toHaveBeenCalledWith('samyImageReader failed:', failure);
  }, 30000);

  it.each([
    ['no ui', null],
    ['a ui of false', 'false'],
  ])(
    'adds nothing and asks nothing with %s',
    async (_name, ui) => {
      const words = `Look${attach(link('a.png'))}`;

      await runTurn(words, newThread(), ui);

      expect(picturesIn(prompts[0])).toEqual([]);
      expect(textsIn(prompts[0]).join('\n')).not.toContain(
        `Image ${link('a.png')}:`
      );
      expect(media.getMediaByPaths).not.toHaveBeenCalled();
    },
    30000
  );

  it('holds input_image at high detail in the real provider’s request, including after a function_call_output', async () => {
    const attached = link('attached.png');
    const made = link('made.png');
    const requests: any[] = [];
    const encoder = new TextEncoder();

    const responses = (events: object[]) =>
      new Response(
        new ReadableStream({
          start(controller) {
            [
              {
                type: 'response.created',
                response: { id: 'r', created_at: 0, model: 'gpt-5.6-luna' },
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
                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
              )
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );

    const args = JSON.stringify({ prompt: made });
    const call = {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'generateImageTool',
    };
    const makeImage = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...call, arguments: '', status: 'in_progress' },
      },
      {
        type: 'response.function_call_arguments.delta',
        item_id: call.id,
        output_index: 0,
        delta: args,
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { ...call, arguments: args, status: 'completed' },
      },
    ];
    const reply = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'msg_1' },
      },
      { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'Done.' },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', id: 'msg_1' },
      },
    ];

    const { createOpenAI } = jest.requireActual('@ai-sdk/openai');
    mockProvider = createOpenAI({
      apiKey: 'test',
      fetch: async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        // The thread's title asks for a whole answer rather than a stream.
        if (!body.stream) {
          return new Response(
            JSON.stringify({
              id: 'r',
              created_at: 0,
              model: 'gpt-5.6-luna',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  id: 'msg',
                  content: [
                    { type: 'output_text', text: 'Title', annotations: [] },
                  ],
                },
              ],
              incomplete_details: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        requests.push(body);
        return responses(requests.length === 1 ? makeImage : reply);
      },
    })('gpt-5.6-luna');

    const { text } = await runTurn(`Make it${attach(attached)}`, newThread());

    expect(text).toBe('Done.');
    const input: any[] = requests[1].input;
    const pictures = input
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
      .filter((part) => part.type === 'input_image');
    expect(pictures).toEqual([
      { type: 'input_image', image_url: attached, detail: 'high' },
      { type: 'input_image', image_url: made, detail: 'high' },
    ]);

    const output = input.findIndex(
      (item) => item.type === 'function_call_output'
    );
    expect(input[output + 1].role).toBe('user');
    expect(input[output + 1].content[1]).toEqual({
      type: 'input_image',
      image_url: made,
      detail: 'high',
    });
  }, 30000);
});
