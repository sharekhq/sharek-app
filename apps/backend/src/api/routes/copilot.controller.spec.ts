// The controller's imports pull in the CopilotKit runtime, Mastra and the whole
// agent tool chain; none of it runs here, so the modules are swapped for shells
// (same pattern as media.controller.spec).
const capturedContexts: any[] = [];
const capturedEndpoints: any[] = [];

jest.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class {},
  copilotRuntimeNodeHttpEndpoint: (options: any) => {
    capturedEndpoints.push(options);
    return () => undefined;
  },
}));
jest.mock('@copilotkit/runtime/v2', () => ({ BuiltInAgent: class {} }));
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

const send = async (body: unknown) => {
  capturedContexts.length = 0;
  const controller = new CopilotController(
    {} as any,
    { mastra: async () => ({}) } as any
  );
  await controller.agent(
    { body } as any,
    {} as any,
    { id: 'org-1' } as any
  );
  expect(capturedContexts).toHaveLength(1);
  return capturedContexts[0];
};

// The request CopilotKit 1.72 sends on its single endpoint: the provider's
// `properties` arrive spread into the run's forwardedProps.
const run = (forwardedProps: unknown) =>
  send({
    method: 'agent/run',
    params: { agentId: 'sharek' },
    body: { forwardedProps },
  });

// Samy names the interface language in its system prompt so the model has a
// stated value instead of a judgment to make (load.tools.service.ts). The
// browser is the only thing that knows which language that is, and it travels
// in the same forwardedProps as the selected channels — a rename on either
// side would drop the anchor with nothing else failing.
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
  // The shape CopilotKit sent before 1.72. Nothing sends it any more, so a
  // controller still reading it would lose the language without an error.
  it('reads nothing from the pre-1.72 request shape', async () => {
    const context = await send({ variables: { properties: { language: 'ar' } } });
    expect(context.get('language')).toBe('');
  });

  it('survives a payload with no properties at all', async () => {
    const context = await run(undefined);
    expect(context.get('language')).toBe('');
    expect(context.get('integrations')).toEqual([]);
  });

  // Samy runs on its own agents, so a service adapter here would only name a
  // model nothing calls.
  it('gives the agent route no fallback model', async () => {
    capturedEndpoints.length = 0;
    await run(undefined);
    expect(capturedEndpoints).toHaveLength(1);
    expect(capturedEndpoints[0].endpoint).toBe('/copilot/agent');
    expect(capturedEndpoints[0]).not.toHaveProperty('serviceAdapter');
  });
});
