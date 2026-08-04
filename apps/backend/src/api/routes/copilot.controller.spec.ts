// The controller's imports pull in the CopilotKit runtime, Mastra and the whole
// agent tool chain; none of it runs here, so the modules are swapped for shells
// (same pattern as media.controller.spec).
const capturedContexts: any[] = [];

jest.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class {},
  OpenAIAdapter: class {},
  copilotRuntimeNodeHttpEndpoint: () => () => undefined,
  copilotRuntimeNextJSAppRouterEndpoint: () => ({
    handleRequest: async () => undefined,
  }),
}));
jest.mock('@gitroom/nestjs-libraries/chat/sharek.agent', () => ({
  getSharekAgents: ({ requestContext }: any) => {
    capturedContexts.push(requestContext);
    return {};
  },
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
// @mastra/core ships an ESM-only transitive dependency that this tree's jest
// config does not transform (libraries/nestjs-libraries/jest.config.ts carries
// the exemption). RequestContext is a keyed bag; that much is easy to stand in.
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

import { CopilotController } from './copilot.controller';

const run = async (properties: unknown) => {
  capturedContexts.length = 0;
  const controller = new CopilotController(
    {} as any,
    { mastra: async () => ({}) } as any
  );
  await controller.agent(
    { body: { variables: { properties } } } as any,
    {} as any,
    { id: 'org-1' } as any
  );
  expect(capturedContexts).toHaveLength(1);
  return capturedContexts[0];
};

// Samy names the interface language in its system prompt so the model has a
// stated value instead of a judgment to make (load.tools.service.ts). The
// browser is the only thing that knows which language that is, and it travels
// on the same CopilotKit `properties` payload the selected channels already use
// — a rename on either side would drop the anchor with nothing else failing.
describe('CopilotController agent request context', () => {
  const key = 'sk-test';
  let previous: string | undefined;

  beforeAll(() => {
    previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = key;
  });

  // Assigning `undefined` would leave the literal string 'undefined' behind,
  // which the controller reads as a key that is set. process.env is shared by
  // every spec file in the worker, so it has to come back unset.
  afterAll(() => {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
  });

  it('carries the interface language the browser sent', async () => {
    const context = await run({ language: 'ar', integrations: [] });
    expect(context.get('language')).toBe('ar');
  });

  it('carries the selected channels alongside it', async () => {
    const integrations = [{ id: 'int-1', identifier: 'instagram' }];
    const context = await run({ language: 'en', integrations });
    expect(context.get('integrations')).toBe(integrations);
  });

  // An older browser, or the MCP path, sends neither. The prompt falls back to
  // its relative wording, so this only has to not throw.
  it('survives a payload with no properties at all', async () => {
    const context = await run(undefined);
    expect(context.get('language')).toBe('');
    expect(context.get('integrations')).toEqual([]);
  });
});
