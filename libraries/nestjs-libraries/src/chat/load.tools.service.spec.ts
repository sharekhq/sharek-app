import { Logger } from '@nestjs/common';
import { RequestContext } from '@mastra/core/di';
import dayjs from 'dayjs';

// load.tools.service imports pStore, which constructs a PostgresStore at module
// scope and throws without DATABASE_URL. Swap it for an in-memory store so the
// spec is hermetic. jest.mock is hoisted above the imports below.
jest.mock('@gitroom/nestjs-libraries/chat/mastra.store', () => {
  const { InMemoryStore } = require('@mastra/core/storage');
  return { pStore: new InMemoryStore() };
});

// The real tool list reaches every social provider, and through them a chunk of
// the monorepo. These tests are about the agent's own configuration — the system
// prompt, the memory options, the provider options — so the tools are noise.
jest.mock('@gitroom/nestjs-libraries/chat/tools/tool.list', () => ({
  toolList: [] as unknown[],
}));

import { LoadToolsService } from '@gitroom/nestjs-libraries/chat/load.tools.service';

// agent() resolves each tool class through ModuleRef; with an empty tool list
// nothing is resolved, but the constructor still wants the dependency.
const moduleRef = {
  get: (token: { name: string }) => ({
    name: token.name,
    run: () => ({ id: token.name }),
  }),
} as any;

const uiContext = () => {
  const requestContext = new RequestContext();
  requestContext.set('ui' as never, 'true' as never);
  return requestContext;
};

const instructionsAt = async (iso: string) => {
  jest.setSystemTime(new Date(iso));
  const agent = await new LoadToolsService(moduleRef).agent();
  const instructions = await agent.getInstructions({
    requestContext: uiContext(),
  });
  expect(typeof instructions).toBe('string');
  return instructions as string;
};

describe('LoadToolsService agent instructions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // OpenAI prompt caching matches an exact prefix. The system prompt is the
  // start of that prefix, so anything inside it that moves faster than the
  // cache TTL costs a full-price re-read of the whole request.
  it('is byte-identical for two requests in the same hour', async () => {
    const early = await instructionsAt('2026-07-28T14:00:03.000Z');
    const late = await instructionsAt('2026-07-28T14:59:47.000Z');
    expect(late).toBe(early);
  });

  it('still tells the model the date and the hour, with no minutes', async () => {
    const at = '2026-07-28T14:30:00.000Z';
    const instructions = await instructionsAt(at);
    // The prompt renders through dayjs(), which resolves in the host timezone
    // rather than the UTC its label claims. That is pre-existing behaviour, so
    // derive the expectation the same way instead of pinning a UTC hour and
    // making this test pass only on a UTC machine.
    expect(instructions).toContain(`${dayjs(at).format('YYYY-MM-DD HH')}:00`);
    expect(instructions).not.toContain(dayjs(at).format('HH:mm:ss'));
  });

  it('moves to the next hour', async () => {
    const before = await instructionsAt('2026-07-28T14:59:59.000Z');
    const after = await instructionsAt('2026-07-28T15:00:01.000Z');
    expect(after).not.toBe(before);
  });
});

describe('LoadToolsService agent memory', () => {
  const memoryConfig = async () => {
    const agent = await new LoadToolsService(moduleRef).agent();
    const memory = await agent.getMemory();
    return memory!.getMergedThreadConfig({});
  };

  // 316 tokens of system block plus a 146-token tool on every turn, for a
  // `proverbs: string[]` schema left behind by the CopilotKit template.
  it('does not enable working memory', async () => {
    const config = await memoryConfig();
    expect(config.workingMemory?.enabled).not.toBe(true);
  });

  it('still generates thread titles', async () => {
    const config = await memoryConfig();
    expect(config.generateTitle).toBe(true);
  });

  // Memory is now the only source of conversation history: SharekAgent forwards
  // just the newest exchange. This window is what the model actually sees, so it
  // has to hold a real conversation — it was 1 only while the client was still
  // resending the whole thread.
  it('keeps a real conversation window, since memory is the only history', async () => {
    const config = await memoryConfig();
    expect(config.lastMessages).toBe(20);
  });
});

describe('LoadToolsService agent provider options', () => {
  const optionsFor = async (requestContext: RequestContext) => {
    const agent = await new LoadToolsService(moduleRef).agent();
    const options = await agent.getDefaultOptions({ requestContext });
    return (options.providerOptions as any)?.openai ?? {};
  };

  const contextWithOrg = (organization: string) => {
    const requestContext = new RequestContext();
    requestContext.set('organization' as never, organization as never);
    return requestContext;
  };

  it('scopes the prompt cache key to the organization', async () => {
    const openai = await optionsFor(
      contextWithOrg(JSON.stringify({ id: 'org-123' }))
    );
    expect(openai).toMatchObject({ promptCacheKey: 'sharek-agent-org-123' });
  });

  // The MCP path only sets `organization` once a tool runs, so these options
  // resolve without it. A missing or malformed value must not fail the request.
  it('omits the cache key when there is no organization in context', async () => {
    const openai = await optionsFor(new RequestContext());
    expect(openai.promptCacheKey).toBeUndefined();
  });

  it('omits the cache key when the organization is not valid json', async () => {
    const openai = await optionsFor(contextWithOrg('not-json'));
    expect(openai.promptCacheKey).toBeUndefined();
  });

  // gpt-5.2 bills reasoning tokens as output, at $14/M against $1.75/M for
  // input. Its documented default is already 'none'; pinning it means a change
  // to that default cannot silently multiply the bill.
  it('pins reasoning effort off, regardless of organization', async () => {
    expect(
      await optionsFor(contextWithOrg(JSON.stringify({ id: 'org-123' })))
    ).toMatchObject({ reasoningEffort: 'none' });
    expect(await optionsFor(new RequestContext())).toMatchObject({
      reasoningEffort: 'none',
    });
  });
});

const instructionsWith = async (requestContext: RequestContext) => {
  const agent = await new LoadToolsService(moduleRef).agent();
  return String(await agent.getInstructions({ requestContext }));
};

const contextWithChannels = (integrations: unknown) => {
  const requestContext = new RequestContext();
  requestContext.set('ui' as never, 'true' as never);
  requestContext.set('integrations' as never, integrations as never);
  return requestContext;
};

const CHANNELS = [
  {
    id: 'int-1',
    identifier: 'instagram',
    picture: 'https://cdn/x.png',
    additionalSettings: '[]',
  },
  {
    id: 'int-2',
    identifier: 'x',
    picture: 'https://cdn/y.png',
    additionalSettings: '[{"title":"Verified","value":true}]',
  },
];

describe('LoadToolsService selected channels', () => {
  // Assert the whole rendered line: 'x' alone appears all over the prompt, so a
  // bare toContain('x') would pass without anything being rendered.
  it('names each selected channel with its id and platform', async () => {
    const instructions = await instructionsWith(contextWithChannels(CHANNELS));
    expect(instructions).toContain('- instagram (id: int-1)');
    expect(instructions).toContain('- x (id: int-2, settings:');
  });

  // The only place the model learns an X account is Verified, which it feeds to
  // integrationSchema's isPremium input, which decides maxLength.
  it('keeps additionalSettings when they carry something', async () => {
    const instructions = await instructionsWith(contextWithChannels(CHANNELS));
    expect(instructions).toContain('Verified');
  });

  it('omits empty additionalSettings', async () => {
    const instructions = await instructionsWith(contextWithChannels(CHANNELS));
    expect(instructions).not.toContain('settings: []');
  });

  // The model cannot see an image from a URL here, and these were ~36% of the
  // block's tokens.
  it('never sends profile pictures', async () => {
    const instructions = await instructionsWith(contextWithChannels(CHANNELS));
    expect(instructions).not.toContain('https://cdn/');
  });

  it('renders no channel section when nothing is selected', async () => {
    for (const value of [[], undefined, null]) {
      const instructions = await instructionsWith(contextWithChannels(value));
      expect(instructions).not.toContain('Channels selected');
    }
  });

  // The value comes from the browser via requestContext, so a malformed payload
  // must not throw: instructions run on every turn and would 500 the chat.
  it('survives a malformed payload', async () => {
    for (const value of ['nonsense', 42, [null, {}, { id: 'no-identifier' }]]) {
      await expect(
        instructionsWith(contextWithChannels(value))
      ).resolves.toBeDefined();
    }
  });

  // Same selection must produce a byte-identical prefix or the cache misses.
  it('is stable for the same selection', async () => {
    const a = await instructionsWith(contextWithChannels(CHANNELS));
    const b = await instructionsWith(contextWithChannels([...CHANNELS]));
    expect(b).toBe(a);
  });
});

describe('LoadToolsService usage logging', () => {
  const onFinishFor = async (organization?: string) => {
    const requestContext = new RequestContext();
    if (organization) {
      requestContext.set('organization' as never, organization as never);
    }
    const agent = await new LoadToolsService(moduleRef).agent();
    const options: any = await agent.getDefaultOptions({ requestContext });
    return options.onFinish as (event: unknown) => void;
  };

  const usage = {
    inputTokens: 2577,
    cachedInputTokens: 2432,
    outputTokens: 301,
    totalTokens: 2878,
  };

  let logged: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    logged = [];
    spy = jest
      .spyOn(Logger, 'log')
      .mockImplementation((message: any) => logged.push(String(message)));
  });

  afterEach(() => spy.mockRestore());

  it('logs the whole-turn token counts', async () => {
    const onFinish = await onFinishFor(JSON.stringify({ id: 'org-9' }));
    onFinish({ runId: 'run-1', totalUsage: usage });

    expect(logged).toHaveLength(1);
    const line = JSON.parse(logged[0]);
    expect(line).toMatchObject({
      org: 'org-9',
      run: 'run-1',
      input: 2577,
      cached: 2432,
      output: 301,
    });
  });

  // Mastra reports usage already summed across steps, but the field name differs
  // by call path; falling back keeps a tool-calling turn from logging zeroes.
  it('falls back to usage when totalUsage is absent', async () => {
    const onFinish = await onFinishFor(JSON.stringify({ id: 'org-9' }));
    onFinish({ runId: 'run-2', usage });
    expect(JSON.parse(logged[0])).toMatchObject({ input: 2577, cached: 2432 });
  });

  it('records a zero cache hit rather than omitting it', async () => {
    const onFinish = await onFinishFor(JSON.stringify({ id: 'org-9' }));
    onFinish({ runId: 'run-3', totalUsage: { ...usage, cachedInputTokens: undefined } });
    expect(JSON.parse(logged[0])).toMatchObject({ cached: 0 });
  });

  // Telemetry must never be able to fail a chat turn.
  it('never throws, whatever it is handed', async () => {
    const onFinish = await onFinishFor(JSON.stringify({ id: 'org-9' }));
    for (const event of [undefined, null, {}, { totalUsage: null }, 'nonsense']) {
      expect(() => onFinish(event)).not.toThrow();
    }
  });

  it('survives a logger that throws', async () => {
    spy.mockImplementation(() => {
      throw new Error('transport down');
    });
    const onFinish = await onFinishFor(JSON.stringify({ id: 'org-9' }));
    expect(() => onFinish({ runId: 'r', totalUsage: usage })).not.toThrow();
  });

  it('still logs when there is no organization in context (MCP path)', async () => {
    const onFinish = await onFinishFor();
    onFinish({ runId: 'run-4', totalUsage: usage });
    expect(JSON.parse(logged[0])).toMatchObject({ org: 'unknown', input: 2577 });
  });
});

// Sharek is Arabic-first, and reasoning effort is pinned to 'none' — there is no
// deliberation step to fall back on if the model drifts to English. Mirroring the
// user's language has to be stated, not assumed.
describe('LoadToolsService language', () => {
  it('answers in the language the user writes in', async () => {
    const instructions = await instructionsWith(new RequestContext());
    expect(instructions).toMatch(/same language the user writes in/i);
  });
});
