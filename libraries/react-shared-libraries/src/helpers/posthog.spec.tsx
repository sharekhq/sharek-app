import { act, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

// posthog-js is replaced by a double: what is under test is what the app asks
// of the SDK — whether it starts at all, the options it initialises with, when
// it identifies, and how a sign-out resets identity. What the real SDK does to
// the consent cookie sharek.app records is pinned in posthog.consent.spec.tsx.
// The double offers only what the app may call, so a call to anything else,
// the SDK's own consent API included, throws.
const sdk = {
  __loaded: true,
  init: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
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

// The choice sharek.app records for the key the specs use.
const CONSENT_COOKIE = '__ph_opt_in_out_phc_test';

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
  // happy-dom keeps cookies from one test to the next.
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`;
});

describe('PHProvider', () => {
  it('initialises the SDK for pageviews, the ref parameter, a consent record of its own, masked auth links and masked replay', async () => {
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
      consent_persistence_name: expect.any(String),
      before_send: expect.any(Function),
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        maskCapturedNetworkRequestFn: expect.any(Function),
      },
    });
    const [, options] = sdk.init.mock.calls[0];
    expect(options.consent_persistence_name).not.toMatch(/^__ph_opt_in_out_/);
  });

  // Declining on sharek.app means no SDK in the app at all: nothing is
  // captured or stored, and nothing is fetched from PostHog.
  it('starts no SDK for a visitor who declined on sharek.app, and still renders the app', async () => {
    document.cookie = `${CONSENT_COOKIE}=0; path=/`;

    const host = await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <span>app</span>
      </PHProvider>
    );

    expect(sdk.init).not.toHaveBeenCalled();
    expect(host.textContent).toBe('app');
  });

  it('starts the SDK for a visitor who accepted on sharek.app', async () => {
    document.cookie = `${CONSENT_COOKIE}=1; path=/`;

    await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <div />
      </PHProvider>
    );

    expect(sdk.init).toHaveBeenCalledTimes(1);
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

describe('events on their way to PostHog', () => {
  const beforeSend = async () => {
    await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <div />
      </PHProvider>
    );
    const [, options] = sdk.init.mock.calls[0];
    expect(options.before_send).toEqual(expect.any(Function));
    return options.before_send as (event: unknown) => unknown;
  };

  // The API accepts these tokens as a login, with no expiry: none may reach
  // PostHog.
  it('masks the token of an activation or password-reset link in every URL property', async () => {
    const send = await beforeSend();

    expect(
      send({
        uuid: 'u1',
        event: '$pageview',
        properties: {
          $current_url: 'https://dash.sharek.app/auth/forgot/aaa.bbb.ccc',
          $pathname: '/auth/forgot/aaa.bbb.ccc',
          $referrer: 'https://dash.sharek.app/auth/activate/ddd.e-e.f_f?lng=ar',
          $prev_pageview_pathname: '/auth/activate/ddd.e-e.f_f',
          title: 'Sharek',
        },
        $set_once: {
          $initial_current_url:
            'https://dash.sharek.app/auth/activate/ddd.e-e.f_f',
        },
      })
    ).toEqual({
      uuid: 'u1',
      event: '$pageview',
      properties: {
        $current_url: 'https://dash.sharek.app/auth/forgot/<masked>',
        $pathname: '/auth/forgot/<masked>',
        $referrer: 'https://dash.sharek.app/auth/activate/<masked>?lng=ar',
        $prev_pageview_pathname: '/auth/activate/<masked>',
        title: 'Sharek',
      },
      $set_once: {
        $initial_current_url: 'https://dash.sharek.app/auth/activate/<masked>',
      },
    });
  });

  it('masks a session token passed as ?loggedAuth=', async () => {
    const send = await beforeSend();

    expect(
      send({
        uuid: 'u3',
        event: '$pageview',
        properties: {
          $current_url:
            'https://dash.sharek.app/launches?loggedAuth=aaa.bbb.ccc&x=1',
        },
      })
    ).toEqual({
      uuid: 'u3',
      event: '$pageview',
      properties: {
        $current_url: 'https://dash.sharek.app/launches?loggedAuth=<masked>&x=1',
      },
    });
  });

  // $web_vitals nests the page URL in each metric, and in the metric's
  // entries, which are browser PerformanceEntry objects sent as their
  // toJSON(); $$heatmap keys its data by the URL.
  it('masks tokens nested inside objects, arrays, entries and object keys', async () => {
    const send = await beforeSend();
    class NavigationEntry {
      constructor(private readonly url: string) {}
      toJSON() {
        return { name: this.url, entryType: 'navigation' };
      }
    }

    expect(
      send({
        uuid: 'u4',
        event: '$web_vitals',
        properties: {
          $web_vitals_FCP_event: {
            name: 'FCP',
            value: 812,
            $current_url: 'https://dash.sharek.app/auth/forgot/aaa.bbb.ccc',
            entries: [
              new NavigationEntry(
                'https://dash.sharek.app/auth/forgot/aaa.bbb.ccc'
              ),
            ],
          },
          $web_vitals_FCP_value: 812,
          $heatmap_data: {
            'https://dash.sharek.app/auth/activate/ddd.e-e.f_f': [
              { x: 10, y: 20, type: 'click' },
            ],
          },
        },
      })
    ).toEqual({
      uuid: 'u4',
      event: '$web_vitals',
      properties: {
        $web_vitals_FCP_event: {
          name: 'FCP',
          value: 812,
          $current_url: 'https://dash.sharek.app/auth/forgot/<masked>',
          entries: [
            {
              name: 'https://dash.sharek.app/auth/forgot/<masked>',
              entryType: 'navigation',
            },
          ],
        },
        $web_vitals_FCP_value: 812,
        $heatmap_data: {
          'https://dash.sharek.app/auth/activate/<masked>': [
            { x: 10, y: 20, type: 'click' },
          ],
        },
      },
    });
  });

  it('leaves every other URL and property as it was', async () => {
    const send = await beforeSend();

    expect(
      send({
        uuid: 'u2',
        event: '$identify',
        properties: {
          $current_url:
            'https://dash.sharek.app/launches?onboarding=true&check=l0oUZRdZOy',
          $pathname: '/auth/activate',
          $referrer: 'https://dash.sharek.app/auth/login',
          $screen_height: 900,
        },
        $set: { email: 'a@b.c', name: 'A' },
      })
    ).toEqual({
      uuid: 'u2',
      event: '$identify',
      properties: {
        $current_url:
          'https://dash.sharek.app/launches?onboarding=true&check=l0oUZRdZOy',
        $pathname: '/auth/activate',
        $referrer: 'https://dash.sharek.app/auth/login',
        $screen_height: 900,
      },
      $set: { email: 'a@b.c', name: 'A' },
    });
  });

  it('keeps an event an earlier hook dropped dropped', async () => {
    const send = await beforeSend();

    expect(send(null)).toBeNull();
  });

  // A recording carries the page URL in its own events, outside before_send.
  it('masks the token in the page URL a recording carries, and keeps the rest of the entry', async () => {
    await render(
      <PHProvider phkey="phc_test" host="https://eu.i.posthog.com">
        <div />
      </PHProvider>
    );
    const [, options] = sdk.init.mock.calls[0];
    const mask = options.session_recording.maskCapturedNetworkRequestFn;
    expect(mask).toEqual(expect.any(Function));
    const entry = { entryType: 'navigation', startTime: 0, duration: 0 };

    expect(
      mask({ ...entry, name: 'https://dash.sharek.app/auth/forgot/aaa.bbb.ccc' })
    ).toEqual({
      ...entry,
      name: 'https://dash.sharek.app/auth/forgot/<masked>',
    });
    expect(
      mask({ ...entry, name: 'https://dash.sharek.app/launches' })
    ).toEqual({ ...entry, name: 'https://dash.sharek.app/launches' });
  });
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

  // A super-admin viewing as a customer would otherwise merge their own
  // browser into the customer's person.
  it('does not identify while impersonating', async () => {
    currentUser = { ...currentUser!, impersonate: true };

    await render(<PostHogIdentify />);

    expect(sdk.identify).not.toHaveBeenCalled();
  });
});

describe('resetAnalyticsIdentity', () => {
  it('resets identity and nothing else', () => {
    resetAnalyticsIdentity();

    expect(sdk.reset).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the SDK never loaded', () => {
    sdk.__loaded = false;

    resetAnalyticsIdentity();

    expect(sdk.reset).not.toHaveBeenCalled();
  });
});
