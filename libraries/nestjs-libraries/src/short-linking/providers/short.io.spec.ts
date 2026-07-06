import type { ShortIo } from './short.io';

// The provider reads its env config at module load, so give each test a
// fresh copy of the module after the env vars for that test are in place.
const loadShortIo = (): ShortIo => {
  let instance: ShortIo | undefined;
  jest.isolateModules(() => {
    const { ShortIo: ShortIoClass } = require('./short.io');
    instance = new ShortIoClass();
  });
  return instance!;
};

describe('ShortIo', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.SHORT_IO_SECRET_KEY = 'sk_test_key';
    process.env.SHORT_IO_SHORT_LINK_DOMAIN = 'go.example.com';
  });

  afterEach(() => {
    delete process.env.SHORT_IO_SECRET_KEY;
    delete process.env.SHORT_IO_SHORT_LINK_DOMAIN;
  });

  it('reads the short domain from SHORT_IO_SHORT_LINK_DOMAIN, defaulting to short.io', () => {
    expect(loadShortIo().shortLinkDomain).toBe('go.example.com');

    delete process.env.SHORT_IO_SHORT_LINK_DOMAIN;
    expect(loadShortIo().shortLinkDomain).toBe('short.io');
  });

  it('creates the short link on the configured domain with the raw API key', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ shortURL: 'https://go.example.com/abc' }),
    });

    const result = await loadShortIo().convertLinkToShortLink(
      'org-1',
      'https://example.com/page'
    );

    expect(result).toBe('https://go.example.com/abc');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.short.io/links');
    expect(init.headers.Authorization).toBe('sk_test_key');
    const body = JSON.parse(init.body);
    expect(body.domain).toBe('go.example.com');
    expect(body.originalURL).toBe('https://example.com/page');
  });

  it('returns the original link when the API responds with an error', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        message: 'Unauthorized',
        statusCode: 401,
        success: false,
      }),
    });

    const result = await loadShortIo().convertLinkToShortLink(
      'org-1',
      'https://example.com/page'
    );

    expect(result).toBe('https://example.com/page');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('returns the original link when the response has no shortURL', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await loadShortIo().convertLinkToShortLink(
      'org-1',
      'https://example.com/page'
    );

    expect(result).toBe('https://example.com/page');
    consoleError.mockRestore();
  });
});
