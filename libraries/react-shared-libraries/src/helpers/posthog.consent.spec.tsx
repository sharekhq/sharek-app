import { act } from 'react';
import { createRoot } from 'react-dom/client';

// The real posthog-js, not a double. A double is what let increment 1 assume
// the SDK reads the consent cookie sharek.app records; it never did. This pins
// what the SDK does to that cookie when it runs with the app's own options.

// posthog-js reads these as it loads; the shared DOM setup installs only what
// React needs.
const browser = window as unknown as Record<string, unknown>;
const globals = global as unknown as Record<string, unknown>;
for (const key of ['location', 'localStorage', 'sessionStorage', 'history']) {
  if (globals[key] === undefined) {
    globals[key] = browser[key];
  }
}

jest.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => undefined,
}));

const SHARED_CONSENT = '__ph_opt_in_out_phc_test';

const readCookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);

// Every write to the named cookie from here on; the SDK writes through
// document.cookie.
const recordWrites = (name: string) => {
  const writes: string[] = [];
  let owner = Object.getPrototypeOf(document);
  while (!Object.getOwnPropertyDescriptor(owner, 'cookie')) {
    owner = Object.getPrototypeOf(owner);
  }
  const cookie = Object.getOwnPropertyDescriptor(owner, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => cookie.get!.call(document),
    set: (value: string) => {
      if (value.startsWith(`${name}=`)) {
        writes.push(value);
      }
      cookie.set!.call(document, value);
    },
  });
  return writes;
};

afterEach(() => {
  jest.useRealTimers();
  Reflect.deleteProperty(document, 'cookie');
  document.cookie = `${SHARED_CONSENT}=; max-age=0; path=/`;
});

it('never writes, moves or deletes the consent cookie sharek.app recorded', async () => {
  // Loaded here rather than imported, so that the globals above exist first.
  const { default: posthog } = await import('posthog-js');
  const { PHProvider } = await import('./posthog');
  document.cookie = `${SHARED_CONSENT}=1; path=/`;

  // The options the app initialises with, taken from the provider itself; the
  // shared instance is left unstarted.
  const init = jest.spyOn(posthog, 'init').mockImplementation(() => posthog);
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(
      <PHProvider phkey="phc_test" host="https://posthog.invalid">
        <div />
      </PHProvider>
    );
  });
  act(() => root.unmount());
  const [token, options] = init.mock.calls[0];
  init.mockRestore();

  const writes = recordWrites(SHARED_CONSENT);
  // The SDK's queue and session timers would otherwise hold the run open.
  jest.useFakeTimers();
  // A named instance picks its consent storage during init, after the options
  // apply: the order in which the SDK adopts a same-named cookie into
  // localStorage and deletes it. Remote config, extensions and flags stay off;
  // they reach the network, and none of them touches consent storage.
  const sdk = posthog.init(
    token,
    {
      ...options,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
    },
    'consent-probe'
  );
  sdk.reset();

  expect(writes).toEqual([]);
  expect(readCookie(SHARED_CONSENT)).toBe('1');
});
