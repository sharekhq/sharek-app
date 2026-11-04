import { WordpressProvider } from './wordpress.provider';

const connect = (domain: string) =>
  new WordpressProvider().authenticate({
    code: Buffer.from(
      JSON.stringify({ domain, username: 'user', password: 'secret' })
    ).toString('base64'),
    codeVerifier: '',
  });

describe('WordpressProvider.authenticate, the domain', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    global.fetch = jest.fn(
      async () => new Response('', { status: 401 })
    ) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it.each([
    ['as typed', 'https://site.com'],
    ['with a trailing slash', 'https://site.com/'],
    ['with several trailing slashes', 'https://site.com///'],
    ['with surrounding whitespace', '  https://site.com/  '],
  ])('builds the REST address from a domain %s', async (_form, domain) => {
    await connect(domain);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://site.com/wp-json/wp/v2/users/me',
      expect.anything()
    );
  });

  // The field comes straight from the request, and this runs on the backend's
  // only thread: a slow trim holds up every other customer's requests.
  it.each([
    ['inside the domain', '/'.repeat(100_000) + 'x'],
    ['at the end of the domain', 'https://site.com' + '/'.repeat(100_000)],
  ])('stays fast on a long run of slashes %s', async (_where, domain) => {
    const started = Date.now();

    await connect(domain);

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
