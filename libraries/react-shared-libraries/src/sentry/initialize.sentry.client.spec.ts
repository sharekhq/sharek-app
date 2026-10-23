/**
 * @jest-environment-options {"customExportConditions": ["browser"]}
 */
// Sentry records no replay of a visitor's session, whatever they chose on sharek.app. Upstream
// records sessions, so this fails if a merge brings the replay integrations back.
// It also pins Sharek's own sampling: upstream raises the browser's profiling to every session
// and its traces to 0.3 on lines that merge without a conflict (cf9ed5af).
import * as Sentry from '@sentry/nextjs';
import { initializeSentryClient } from './initialize.sentry.client';

// The real basic init, with a transport that drops every envelope so nothing leaves the test.
jest.mock('@gitroom/react/sentry/initialize.sentry.next.basic', () => {
  const actual = jest.requireActual(
    '@gitroom/react/sentry/initialize.sentry.next.basic'
  );
  const transport = () => ({
    send: async () => ({}),
    flush: async () => true,
  });
  return {
    ...actual,
    initializeSentryBasic: (
      environment: string,
      dsn: string,
      extension: object
    ) =>
      actual.initializeSentryBasic(environment, dsn, {
        ...extension,
        transport,
      }),
  };
});

beforeAll(() => {
  // The SDK reads location off globalThis, and tracing reads history and listens there too; the
  // shared DOM harness only installs them on window.
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.location = window.location;
  globals.history = window.history;
  globals.addEventListener = window.addEventListener.bind(window);
  globals.removeEventListener = window.removeEventListener.bind(window);
  // Tracing starts a page-load span whose 30-second timer nothing clears, so the timers are fake.
  // They stay fake until Jest tears the file down: the SDK wraps setTimeout, and restoring real
  // timers under that wrapper deletes the global. Nothing is sent, so there is nothing to flush.
  jest.useFakeTimers();
  initializeSentryClient('production', 'https://public@o1.ingest.sentry.io/1');
});

// The options the client started with, as the SDK holds them.
const options = () =>
  (Sentry.getClient()?.getOptions() || {}) as Record<string, unknown>;

describe('initializeSentryClient', () => {
  it('starts Sentry without session replay', () => {
    const client = Sentry.getClient();

    // The app's own integrations are in place, so the client did start.
    expect(client?.getIntegrationByName('Feedback')).toBeDefined();
    expect(client?.getIntegrationByName('Replay')).toBeUndefined();
    expect(client?.getIntegrationByName('ReplayCanvas')).toBeUndefined();
  });

  // Sampling rates for replays would record sessions the moment an integration came back.
  it('asks for no replay sampling', () => {
    expect(options().replaysSessionSampleRate).toBeUndefined();
    expect(options().replaysOnErrorSampleRate).toBeUndefined();
  });

  it("keeps Sharek's sampling: traces 0.1, profiling 0.6 in production", () => {
    expect(options().tracesSampleRate).toBe(0.1);
    expect(options().profilesSampleRate).toBe(0.6);
  });

  it('sends no default personal data', () => {
    expect(options().sendDefaultPii).toBe(false);
  });

  // A layout that mounts again calls this again: the running client stays the one in use.
  it('starts once', () => {
    const client = Sentry.getClient();

    initializeSentryClient(
      'production',
      'https://public@o1.ingest.sentry.io/1'
    );

    expect(Sentry.getClient()).toBe(client);
  });
});
