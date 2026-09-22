import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// posthog-js is replaced by a double: what is under test is what the app asks
// of the SDK — the options it initialises with, when it identifies, and how a
// sign-out resets identity without erasing a consent choice sharek.app
// recorded on the shared cookie.
const sdk = {
  __loaded: true,
  init: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
  opt_in_capturing: jest.fn(),
  has_opted_out_capturing: jest.fn(() => false),
  get_explicit_consent_status: jest.fn(
    (): 'granted' | 'denied' | 'pending' => 'pending'
  ),
};
let currentUser:
  | { id: string; email: string; name: string; impersonate: boolean }
  | undefined;

jest.mock('posthog-js', () => ({ __esModule: true, default: sdk }));
jest.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => currentUser,
}));

import { PHProvider, PostHogIdentify, resetAnalyticsIdentity } from './posthog';

const mounted: Array<{ unmount: () => void }> = [];

const render = async (element: ReactNode) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push(root);
  await act(async () => {
    root.render(element);
  });
  return host;
};

beforeEach(() => {
  jest.clearAllMocks();
  sdk.__loaded = true;
  sdk.has_opted_out_capturing.mockReturnValue(false);
  sdk.get_explicit_consent_status.mockReturnValue('pending');
  // The real reset() also deletes the consent cookie, so the choice reads as
  // pending afterwards.
  sdk.reset.mockImplementation(() => {
    sdk.get_explicit_consent_status.mockReturnValue('pending');
  });
  currentUser = {
    id: 'user-1',
    email: 'a@b.c',
    name: 'A',
    impersonate: false,
  };
});

afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((root) => root.unmount());
  });
  document.body.innerHTML = '';
});

describe('PHProvider', () => {
  it('initialises the SDK for pageviews, the ref parameter, the shared consent cookie and masked replay', async () => {
    await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <div />
      </PHProvider>
    );

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith('phc_test', {
      api_host: 'https://eu.i.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: 'history_change',
      custom_campaign_params: ['ref'],
      opt_out_capturing_persistence_type: 'cookie',
      opt_out_persistence_by_default: true,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
    });
  });

  // Either option makes a visitor who never saw the sharek.app notice — every
  // existing user — opted out: no storage and no identify. The app honours a
  // recorded decline by not capturing at all instead.
  it('never makes the app cookieless or opts visitors out by default', async () => {
    await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <div />
      </PHProvider>
    );

    const [, options] = sdk.init.mock.calls[0];
    expect(options).not.toHaveProperty('cookieless_mode');
    expect(options).not.toHaveProperty('opt_out_capturing_by_default');
  });

  it.each([
    ['key', { host: 'https://eu.i.posthog.com' }],
    ['host', { phkey: 'phc_test' }],
  ])(
    'loads no SDK without a %s and still renders the app',
    async (_, props) => {
      const host = await render(
        <PHProvider {...props}>
          <span>app</span>
        </PHProvider>
      );

      expect(sdk.init).not.toHaveBeenCalled();
      expect(host.textContent).toBe('app');
    }
  );
});

describe('PostHogIdentify', () => {
  it('identifies the signed-in user once, with their email and name', async () => {
    await render(<PostHogIdentify />);

    expect(sdk.identify).toHaveBeenCalledTimes(1);
    expect(sdk.identify).toHaveBeenCalledWith('user-1', {
      email: 'a@b.c',
      name: 'A',
    });
  });

  it('does not identify when the SDK has not loaded', async () => {
    sdk.__loaded = false;

    await render(<PostHogIdentify />);

    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it('does not identify a visitor who declined analytics on sharek.app', async () => {
    sdk.has_opted_out_capturing.mockReturnValue(true);

    await render(<PostHogIdentify />);

    expect(sdk.identify).not.toHaveBeenCalled();
  });

  // A super-admin viewing as a customer would otherwise merge their own
  // browser into the customer's person.
  it('does not identify while impersonating', async () => {
    currentUser = { ...currentUser!, impersonate: true };

    await render(<PostHogIdentify />);

    expect(sdk.identify).not.toHaveBeenCalled();
  });
});

describe('resetAnalyticsIdentity', () => {
  it('resets identity, then re-records a consent the visitor granted', () => {
    sdk.get_explicit_consent_status.mockReturnValue('granted');

    resetAnalyticsIdentity();

    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalledWith({
      captureEventName: false,
    });
    expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.opt_in_capturing.mock.invocationCallOrder[0]
    );
  });

  it('resets identity without recording a consent nobody gave', () => {
    resetAnalyticsIdentity();

    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
  });

  // Their SDK holds no state, and reset() would delete the `0` they chose.
  it('leaves a visitor who declined untouched', () => {
    sdk.has_opted_out_capturing.mockReturnValue(true);
    sdk.get_explicit_consent_status.mockReturnValue('denied');

    resetAnalyticsIdentity();

    expect(sdk.reset).not.toHaveBeenCalled();
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
  });

  it('does nothing when the SDK never loaded', () => {
    sdk.__loaded = false;

    resetAnalyticsIdentity();

    expect(sdk.reset).not.toHaveBeenCalled();
    expect(sdk.opt_in_capturing).not.toHaveBeenCalled();
  });
});
