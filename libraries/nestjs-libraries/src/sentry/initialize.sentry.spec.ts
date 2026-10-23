// The API's and the workers' Sentry options: the backend and the orchestrator both start through
// initializeSentry. Sharek keeps its own sampling, which upstream raises on lines that merge without
// a conflict (2ffd05fc), and takes upstream's privacy and noise rules (42bc85ed, 2ffd05fc).

const mockInit = jest.fn();
const mockOpenAIIntegration = jest.fn();
// The SDK would start a client; only the options handed to it are under test.
jest.mock('@sentry/nestjs', () => ({
  init: (options: unknown) => mockInit(options),
  consoleLoggingIntegration: () => ({ name: 'Console' }),
  openAIIntegration: (options: unknown) => {
    mockOpenAIIntegration(options);
    return { name: 'OpenAI' };
  },
  setUser: jest.fn(),
  setTag: jest.fn(),
}));
jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: () => ({ name: 'ProfilingIntegration' }),
}));

import { initializeSentry } from './initialize.sentry';

type SamplingContext = {
  name?: string;
  attributes?: Record<string, unknown>;
  normalizedRequest?: { url?: string; method?: string };
  inheritOrSampleWith: (rate: number) => number;
};
type Options = {
  tracesSampler: (context: SamplingContext) => number;
  profileSessionSampleRate: number;
  ignoreSpans: unknown[];
};

const options = () => {
  initializeSentry('backend', true);
  return mockInit.mock.calls[0][0] as Options;
};

// No parent decision in these cases, so the fallback rate is the answer.
const sample = (context: Omit<SamplingContext, 'inheritOrSampleWith'>) =>
  options().tracesSampler({ ...context, inheritOrSampleWith: (rate) => rate });

beforeEach(() => {
  mockInit.mockReset();
  mockOpenAIIntegration.mockReset();
  process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://key@o0.ingest.de.sentry.io/1';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

describe('the API and worker Sentry options', () => {
  it('traces one request in ten', () => {
    expect(
      sample({
        name: 'GET /posts',
        normalizedRequest: { url: '/posts', method: 'GET' },
      })
    ).toBe(0.1);
  });

  // NODE_ENV is "test" here, which takes the production branch.
  it('profiles one traced session in five', () => {
    expect(options().profileSessionSampleRate).toBe(0.2);
  });

  it('traces one public analytics request in a hundred', () => {
    expect(
      sample({
        name: 'GET /public/v1/analytics/abc',
        normalizedRequest: { url: '/public/v1/analytics/abc', method: 'GET' },
      })
    ).toBe(0.01);
  });

  it('never traces Prisma spans or the MCP stream GETs', () => {
    expect(sample({ name: 'prisma:client:operation' })).toBe(0);
    expect(
      sample({
        name: 'GET /mcp/key',
        normalizedRequest: { url: '/mcp/key', method: 'GET' },
      })
    ).toBe(0);
  });

  it('records no AI prompts or outputs', () => {
    options();

    expect(mockOpenAIIntegration).toHaveBeenCalledWith({
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('drops the express middleware noise spans', () => {
    expect(options().ignoreSpans).toEqual(
      expect.arrayContaining([{ op: 'middleware.express' }])
    );
  });

  it('starts nothing without a DSN', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    expect(initializeSentry('backend')).toBeNull();
    expect(mockInit).not.toHaveBeenCalled();
  });
});
