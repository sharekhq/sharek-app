// posthog-node is the transport; a double stands in for it so each case can
// choose what the client does. The Facebook SDK the same module loads is
// swapped for inert shells: none of its code runs here.
const mockPostHogConstructor = jest.fn();
const mockCapture = jest.fn();
const mockOn = jest.fn();
jest.mock('posthog-node', () => ({
  PostHog: class {
    constructor(...args: unknown[]) {
      mockPostHogConstructor(...args);
    }
    capture = mockCapture;
    on = mockOn;
  },
}));
jest.mock('facebook-nodejs-business-sdk', () => ({
  FacebookAdsApi: { init: jest.fn() },
  ServerEvent: class {},
  EventRequest: class {},
  UserData: class {},
  CustomData: class {},
}));

import { TrackService } from './track.service';

const KEY = 'phc_test';
const HOST = 'https://eu.i.posthog.com';

beforeEach(() => {
  jest.resetAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = KEY;
  process.env.NEXT_PUBLIC_POSTHOG_HOST = HOST;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe('TrackService.capture', () => {
  it.each(['NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST'])(
    'builds no client and sends nothing while %s is unset',
    (name) => {
      delete process.env[name];

      expect(
        new TrackService().capture('user-1', 'signed_up')
      ).toBeUndefined();
      expect(mockPostHogConstructor).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    }
  );

  // Lifecycle events come a few times a day, so each one is sent as it
  // arrives rather than batched until a restart can lose it.
  it('builds one client from the two variables and sends each event at once', () => {
    const track = new TrackService();

    track.capture('user-1', 'signed_up');
    track.capture('user-1', 'activated');

    expect(mockPostHogConstructor).toHaveBeenCalledTimes(1);
    expect(mockPostHogConstructor).toHaveBeenCalledWith(KEY, {
      host: HOST,
      flushAt: 1,
    });
    expect(mockCapture).toHaveBeenCalledTimes(2);
  });

  it('listens for transport errors on the client', () => {
    new TrackService().capture('user-1', 'signed_up');

    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('sends the distinct id, the event and its properties, $set_once included', () => {
    new TrackService().capture('user-1', 'signed_up', {
      provider: 'LOCAL',
      $set_once: { $initial_ref: 'home-hero' },
    });

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'signed_up',
      properties: {
        provider: 'LOCAL',
        $set_once: { $initial_ref: 'home-hero' },
      },
    });
  });

  it('sends empty properties when the event has none', () => {
    new TrackService().capture('user-1', 'activated');

    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'activated',
      properties: {},
    });
  });

  it('keeps a client that throws from reaching the caller', () => {
    mockCapture.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(
      new TrackService().capture('user-1', 'signed_up')
    ).toBeUndefined();
  });

  it('keeps a client that cannot be built from reaching the caller', () => {
    mockPostHogConstructor.mockImplementation(() => {
      throw new Error('invalid options');
    });

    expect(
      new TrackService().capture('user-1', 'signed_up')
    ).toBeUndefined();
  });

  it('keeps a transport error inside the client', () => {
    new TrackService().capture('user-1', 'signed_up');
    const [, listener] = mockOn.mock.calls[0];

    expect(() => listener(new Error('ECONNREFUSED'))).not.toThrow();
  });

  // Callers put the capture on the request path and never await it.
  it('returns nothing to await', () => {
    const result: unknown = new TrackService().capture('user-1', 'signed_up');

    expect(result).toBeUndefined();
  });
});
