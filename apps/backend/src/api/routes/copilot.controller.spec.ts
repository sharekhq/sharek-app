// The controller's imports pull in the CopilotKit runtime, Mastra and the whole
// agent tool chain; none of it runs here, so the modules are swapped for shells
// (same pattern as media.controller.spec).
const capturedContexts: any[] = [];
const capturedEndpoints: Record<string, unknown>[] = [];
const capturedRuntimes: Record<string, unknown>[] = [];
const capturedRunErrors: unknown[][] = [];

jest.mock('@copilotkit/runtime', () => ({
  CopilotRuntime: class {
    constructor(params: Record<string, unknown>) {
      capturedRuntimes.push(params);
    }
  },
  copilotRuntimeNodeHttpEndpoint: (options: Record<string, unknown>) => {
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
  logRunError: (...args: unknown[]) => {
    capturedRunErrors.push(args);
  },
}));
jest.mock('@gitroom/nestjs-libraries/chat/mastra.service', () => ({
  MastraService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
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

import { Logger } from '@nestjs/common';
import { CopilotController } from './copilot.controller';

// The one live brand of org-1; any other id is another organization's, deleted
// or never was, as BrandService answers it
const liveBrand = '7f1c3a52-0d4e-4b8a-9c61-2e5f8a9b3d70';
const isLive = jest.fn();

const send = async (body: unknown) => {
  capturedContexts.length = 0;
  const controller = new CopilotController(
    {} as any,
    { mastra: async () => ({}) } as any,
    {} as unknown as ConstructorParameters<typeof CopilotController>[2],
    { isLive } as unknown as ConstructorParameters<typeof CopilotController>[3]
  );
  await controller.agent({ body } as any, {} as any, { id: 'org-1' } as any);
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

  // The shape CopilotKit sent before 1.72. Nothing sends it any more, so a
  // controller still reading it would lose the language without an error.
  it('reads nothing from the pre-1.72 request shape', async () => {
    const context = await send({
      variables: { properties: { language: 'ar' } },
    });
    expect(context.get('language')).toBe('');
  });

  // An older browser, or the MCP path, sends neither. The prompt falls back to
  // its relative wording, so this only has to not throw.
  it('survives a payload with no properties at all', async () => {
    const context = await run(undefined);
    expect(context.get('language')).toBe('');
    expect(context.get('integrations')).toEqual([]);
  });

  // The brand chip's choice decides the kit before the channels do
  // (contracts/samy-brand.md), so the image tool takes what it finds here as
  // checked: only none, each or a live brand of the asking organization.
  describe('the brand chip', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      isLive.mockReset();
      isLive.mockImplementation(
        async (org: string, id: string) => org === 'org-1' && id === liveBrand
      );
      warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => warn.mockRestore());

    it.each(['none', 'each'])('carries %s as sent', async (brand) => {
      const context = await run({ language: 'en', integrations: [], brand });
      expect(context.get('brand')).toBe(brand);
      expect(isLive).not.toHaveBeenCalled();
    });

    it('carries a live brand of the organization', async () => {
      const context = await run({ integrations: [], brand: liveBrand });
      expect(context.get('brand')).toBe(liveBrand);
      expect(isLive).toHaveBeenCalledWith('org-1', liveBrand);
    });

    it.each([
      [
        "another organization's or a deleted brand",
        'c2b8e4f1-5a3d-4e7b-8f90-1d6a2c4e8b35',
      ],
      ['a string that is no brand id', 'Rawda'],
    ])('drops %s', async (_what, brand) => {
      const context = await run({ integrations: [], brand });
      expect(context.get('brand')).toBeUndefined();
      expect(isLive).toHaveBeenCalledWith('org-1', brand);
    });

    // An object could reach Prisma as a filter, so only a string is checked
    it.each([42, true, null, {}, [liveBrand], { not: '' }])(
      'drops %p without asking for it',
      async (brand) => {
        const context = await run({ integrations: [], brand });
        expect(context.get('brand')).toBeUndefined();
        expect(isLive).not.toHaveBeenCalled();
      }
    );

    it('sets no brand when the browser sends none, as while the chip waits', async () => {
      const context = await run({ language: 'en', integrations: [] });
      expect(context.get('brand')).toBeUndefined();
      expect(isLive).not.toHaveBeenCalled();
    });

    // The chat goes on without a brand, as with one that's not live, and the
    // failure is logged rather than thrown
    it('drops the brand when the check fails, and the run goes on', async () => {
      isLive.mockRejectedValue(new Error('connection lost'));
      capturedEndpoints.length = 0;

      const context = await run({ integrations: [], brand: liveBrand });
      expect(context.get('brand')).toBeUndefined();
      expect(capturedEndpoints).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(1);
    });
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

  // A run that fails or ends unfinished shows nothing in the chat; this is what
  // puts it in the server logs, under the organization it ran for.
  it('reports failed runs under the request organization', async () => {
    capturedRuntimes.length = 0;
    capturedRunErrors.length = 0;
    await run(undefined);
    expect(capturedRuntimes).toHaveLength(1);

    const failed = { context: { threadId: 'thread-1' } };
    (capturedRuntimes[0].onError as (event: unknown) => void)(failed);
    expect(capturedRunErrors).toEqual([[failed, 'org-1']]);
  });
});
