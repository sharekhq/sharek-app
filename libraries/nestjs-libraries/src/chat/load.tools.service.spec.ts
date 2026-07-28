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

  // The client resends the whole thread on every turn, and Mastra prepends its
  // own recall window on top of it because @ag-ui/mastra strips the message ids
  // that its dedupe needs. Anything above 1 is paid for twice. 0 and false are
  // not options: they stop Mastra persisting the thread at all.
  it('keeps the server-side recall window at the persistence minimum', async () => {
    const config = await memoryConfig();
    expect(config.lastMessages).toBe(1);
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
