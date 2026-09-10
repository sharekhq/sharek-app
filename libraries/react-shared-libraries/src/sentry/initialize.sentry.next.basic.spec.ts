/**
 * @jest-environment-options {"customExportConditions": ["browser"]}
 */
// The browser build of @sentry/nextjs is the one that rewrites frame origins, so the package is
// resolved here the way a browser bundle resolves it.
import * as Sentry from '@sentry/nextjs';
import type { BrowserOptions, Event as SentryEvent } from '@sentry/nextjs';
import { initializeSentryBasic } from './initialize.sentry.next.basic';

const sentEvents: SentryEvent[] = [];

const testOptions: BrowserOptions = {
  // Records error events instead of sending them. Sessions and client reports travel through
  // the same transport and are not what these specs measure.
  transport: () => ({
    send: async (envelope) => {
      for (const [headers, payload] of envelope[1]) {
        if (headers.type === 'event') {
          sentEvents.push(payload as SentryEvent);
        }
      }
      return {};
    },
    flush: async () => true,
  }),
  // Tracing also needs history and event listeners on globalThis, which the harness lacks.
  integrations: (defaults) =>
    defaults.filter((integration) => integration.name !== 'BrowserTracing'),
};

const errorWithStack = (message: string, frames: string[]) => {
  const error = new Error(message);
  error.stack = [`Error: ${message}`, ...frames].join('\n');
  return error;
};

const ownBundleFrame =
  '    at onClick (https://dash.sharek.app/_next/static/chunks/app/page.js:1:100)';

// Lets a dynamic import started from beforeSend settle; flush() does not wait for it.
const settle = () => new Promise((resolve) => setImmediate(resolve));

// Chrome reports a real origin for chrome-extension:// URLs while Node reports "null". Without
// this the SDK's origin rewrite never touches an extension frame, and the drop tests would pass
// even if the URL filter ran after the rewrite.
class ChromeLikeURL extends URL {
  override get origin() {
    const extensionOrigin = /^chrome-extension:\/\/[^/]+/.exec(this.href);
    return extensionOrigin ? extensionOrigin[0] : super.origin;
  }
}

beforeAll(() => {
  // The SDK reads location off globalThis; the shared DOM harness only installs it on window.
  globalThis.location = window.location;
  globalThis.URL = ChromeLikeURL;
  initializeSentryBasic('test', 'https://public@o1.ingest.sentry.io/1', testOptions);
});

afterAll(() => Sentry.close());

beforeEach(() => {
  sentEvents.length = 0;
});

describe('initializeSentryBasic', () => {
  it.each([
    ['Chrome', 'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js'],
    ['Firefox', 'moz-extension://8b6c1a2e-5f1d-4c7a-9b3e-2d4f6a8c0e1b/scripts/inpage.js'],
    ['Safari', 'safari-web-extension://3f2a1b4c-6d5e-4f7a-8b9c-0d1e2f3a4b5c/scripts/inpage.js'],
    ['masked Safari', 'webkit-masked-url://hidden/'],
  ])('drops errors thrown by %s extension code', async (_browser, url) => {
    Sentry.captureException(
      errorWithStack('MetaMask extension not found', [
        `    at ${url}:4:42708`,
        `    at Object.connect (${url}:7:84292)`,
      ])
    );
    await Sentry.flush();

    expect(sentEvents).toHaveLength(0);
  });

  it('keeps sending errors thrown by our own bundle', async () => {
    Sentry.captureException(errorWithStack('boom', [ownBundleFrame]));
    await Sentry.flush();

    expect(sentEvents).toHaveLength(1);
    // The SDK's origin rewrite ran on this event, so the URL filter is what keeps extension
    // errors out, not the rewrite.
    expect(
      sentEvents[0].exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename
    ).toBe('app:///_next/static/chunks/app/page.js');
  });

  it('does not open the crash-report dialog for a captured error', async () => {
    Sentry.captureException(errorWithStack('dialog probe', [ownBundleFrame]));
    await Sentry.flush();
    await settle();

    expect(document.querySelector('script[src*="/api/embed/error-page/"]')).toBeNull();
  });
});
