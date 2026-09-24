/**
 * @jest-environment-options {"customExportConditions": ["browser"]}
 */
// Sentry records no replay of a visitor's session, whatever they chose on sharek.app. Upstream
// records sessions, so this fails if a merge brings the replay integrations back.
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

describe('initializeSentryClient', () => {
  it('starts Sentry without session replay', () => {
    const client = Sentry.getClient();

    // The app's own integrations are in place, so the client did start.
    expect(client?.getIntegrationByName('Feedback')).toBeDefined();
    expect(client?.getIntegrationByName('Replay')).toBeUndefined();
    expect(client?.getIntegrationByName('ReplayCanvas')).toBeUndefined();
  });
});
