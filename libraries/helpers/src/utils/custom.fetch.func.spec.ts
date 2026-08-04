import {
  AlreadyAnsweredError,
  customFetch,
  isAlreadyAnswered,
} from './custom.fetch.func';

const respondWith = (status: number, body: unknown = {}) => {
  const response = new Response(JSON.stringify(body), { status });
  (global as any).fetch = jest.fn().mockResolvedValue(response);
  return response;
};

const wrapper = (afterRequest?: (...args: any[]) => Promise<boolean>) =>
  customFetch({ baseUrl: 'https://api.test', afterRequest } as any);

describe('customFetch', () => {
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('resolves with the response when the interceptor passes it through', async () => {
    const response = respondWith(200, { ok: true });
    const result = await wrapper(async () => true)('/posts');
    expect(result).toBe(response);
  });

  it('resolves when there is no interceptor at all', async () => {
    const response = respondWith(200);
    expect(await wrapper()('/posts')).toBe(response);
  });

  // The whole point of the change. Most callers in this app never inspect the
  // response — `await fetch('/webhooks', …)` and straight on to
  // toast('added successfully'). To them a resolved response is
  // indistinguishable from success, so a refusal the interceptor has already
  // answered must NOT resolve, or they announce something that never happened.
  describe('when the interceptor has already answered the request', () => {
    it('rejects rather than resolving, so a caller cannot read it as success', async () => {
      respondWith(402, { message: 'Payment Required' });

      await expect(wrapper(async () => false)('/webhooks')).rejects.toThrow(
        AlreadyAnsweredError
      );
    });

    // It used to return `new Promise(() => {})`, which never settled: the
    // caller's `finally` never ran and the surface span forever. Rejecting
    // stops the success path exactly as the hang did, while letting cleanup
    // run — that is the bug this whole feature started from.
    it('settles, so the caller\'s finally still runs', async () => {
      respondWith(402);
      const cleanup = jest.fn();

      await expect(
        (async () => {
          try {
            await wrapper(async () => false)('/webhooks');
          } finally {
            cleanup();
          }
        })()
      ).rejects.toBeInstanceOf(AlreadyAnsweredError);

      expect(cleanup).toHaveBeenCalled();
    });

    it('carries the status it was answering', async () => {
      respondWith(406);

      await expect(wrapper(async () => false)('/media/generate-video')).rejects.toMatchObject(
        { status: 406 }
      );
    });

    // Callers that show their own "Failed to…" message need to tell this
    // refusal apart from a real failure, or they stack a generic error on top
    // of the modal that already explained it.
    it('is recognisable through isAlreadyAnswered', async () => {
      respondWith(402);

      const err = await wrapper(async () => false)('/posts').catch((e) => e);

      expect(isAlreadyAnswered(err)).toBe(true);
      expect(isAlreadyAnswered(new Error('socket hang up'))).toBe(false);
      expect(isAlreadyAnswered(undefined)).toBe(false);
    });
  });
});
