import { HttpException, Logger } from '@nestjs/common';
import {
  FirecrawlService,
  SiteBranding,
  WebPage,
  WebResult,
} from '@gitroom/nestjs-libraries/firecrawl/firecrawl.service';

// The service's own failures, word for word: the model relays them to the
// user.
const CREDITS =
  "The web lookup service has used up its credits for now. Tell the user web lookups aren't available right now; don't answer from memory as if you had read it.";
const REFUSED =
  "The web lookup service refused the request. Say the lookup failed; don't answer from memory as if you had read it.";
const BUSY =
  'The web lookup service is busy. Say the lookup failed and offer to try again in a moment.';
const UNREACHABLE =
  "The web lookup service couldn't be reached. Say the lookup failed and offer to try again.";
const TOO_LONG =
  'The web lookup took too long. Say it failed and offer to try again.';

// What Firecrawl says of the site itself, which the Brands card tells apart
// by status.
const SITE_REFUSED = "This kind of site can't be read.";
const SITE_UNREADABLE = "This site couldn't be read.";

// What Firecrawl says of one page of a read, which comes back as that page's
// error while the other pages are read.
const PAGE_REFUSED = "This site doesn't allow its pages to be read.";
const UNREADABLE = "This page couldn't be read.";

const answer = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// What a gateway in front of Firecrawl may answer with: a page, not JSON.
const notJson = (status: number) =>
  new Response('<html><body>Bad gateway</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });

// An answer whose body stops arriving once the call's time is up.
const stalled = () => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.reject(
      new DOMException('The operation was aborted', 'TimeoutError')
    ),
});

const rejection = (call: Promise<unknown>) =>
  call.then(
    () => {
      throw new Error('the call resolved');
    },
    (err) => err
  );

// A branding answer as Firecrawl gives it, with parts the service doesn't use.
const BRANDING = {
  colorScheme: 'light',
  logo: 'https://a.example/logo.png',
  images: {
    logo: 'https://cdn.a.example/logo.svg',
    favicon: 'https://a.example/apple-touch-icon.png',
    ogImage: 'https://a.example/banner.jpg',
  },
  colors: {
    primary: '#1B4D3E',
    secondary: '#C8A24A',
    accent: '#D9534F',
    background: '#FFFFFF',
    textPrimary: '#111111',
    link: '#0645AD',
  },
  fonts: [
    { family: 'Tajawal', role: 'heading' },
    { family: 'IBM Plex Sans Arabic', role: 'body' },
  ],
  typography: {
    fontFamilies: { primary: 'IBM Plex Sans Arabic', heading: 'Tajawal' },
    fontSizes: { h1: '48px', body: '16px' },
  },
  personality: { tone: 'friendly' },
};

// `page` is the status the site's page itself answered, as the metadata gives
// it.
const scraped = (
  branding: unknown = BRANDING,
  page: object = { statusCode: 200 }
) => ({
  success: true,
  data: {
    branding,
    metadata: {
      url: 'https://www.a.example/ar',
      creditsUsed: 1,
      ...page,
    },
  },
});

const branded = (changes: object) =>
  answer(200, scraped({ ...BRANDING, ...changes }));

const FOUND: SiteBranding = {
  url: 'https://www.a.example/ar',
  logo: 'https://cdn.a.example/logo.svg',
  icon: 'https://a.example/apple-touch-icon.png',
  colours: ['#1B4D3E', '#C8A24A', '#D9534F'],
  headingFont: 'Tajawal',
  bodyFont: 'IBM Plex Sans Arabic',
};

const lookup = () =>
  new FirecrawlService().branding('org-1', 'https://a.example');

// A search answer as Firecrawl gives it, with parts the service doesn't use.
const searched = (web: unknown[]) => ({
  success: true,
  data: { web },
  creditsUsed: 2,
});

const search = () => new FirecrawlService().search('org-1', 'سوق الخبر');

// A page as Firecrawl reads it; `metadata` adds to what it says of the page,
// or replaces it.
const markdown = (text: string, metadata: object = {}) => ({
  success: true,
  data: {
    markdown: text,
    metadata: {
      url: 'https://a.example/',
      statusCode: 200,
      creditsUsed: 1,
      ...metadata,
    },
  },
});

const read = (urls = ['https://a.example/']) =>
  new FirecrawlService().read('org-1', urls);

// A read asks for each address in a call of its own, so each call is answered
// by its address's entry: what fetch resolves with, or a rejection.
const answering = (replies: Record<string, () => unknown>) =>
  fetchSpy.mockImplementation(async (_, init) =>
    replies[JSON.parse(init.body).url]()
  );

let fetchSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
let logged: { line: any; context: string }[];

beforeEach(() => {
  process.env.FIRECRAWL_API_KEY = 'fc-test';
  // Every case answers for Firecrawl itself; nothing reaches the network.
  fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('no network in unit tests'));
  logged = [];
  logSpy = jest
    .spyOn(Logger, 'log')
    .mockImplementation((message: any, context?: any) => {
      logged.push({ line: JSON.parse(message), context });
    });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.FIRECRAWL_API_KEY;
});

describe('FirecrawlService.branding', () => {
  // No maxAge is sent, so Firecrawl's stored copy of a page may answer.
  it("asks Firecrawl to scrape the address for its branding, with the key and 25 seconds of Firecrawl's time", async () => {
    fetchSpy.mockResolvedValue(answer(200, scraped()));

    await lookup();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer fc-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      url: 'https://a.example',
      formats: [{ type: 'branding' }],
      timeout: 25000,
    });
  });

  it('gives the call 30 seconds', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockResolvedValue(answer(200, scraped()));

    await lookup();

    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetchSpy.mock.calls[0][1].signal).toBe(
      timeout.mock.results[0].value
    );
  });

  it("answers the address the site led to, its logo, icon, three brand colours and two fonts, and nothing else of Firecrawl's", async () => {
    fetchSpy.mockResolvedValue(answer(200, scraped()));

    expect(await lookup()).toStrictEqual(FOUND);
  });

  it.each([
    ['names no address', { statusCode: 200 }],
    ['carries no metadata', undefined],
    ['carries a null metadata', null],
  ])('answers the address asked when the answer %s', async (_, metadata) => {
    fetchSpy.mockResolvedValue(
      answer(200, { success: true, data: { branding: BRANDING, metadata } })
    );

    expect(await lookup()).toStrictEqual({
      ...FOUND,
      url: 'https://a.example',
    });
  });

  // Only an error from the site's page changes the answer. A metadata that is
  // missing or null names no status either, and is among the cases above.
  it.each([
    ['a 200', { statusCode: 200 }],
    ['a 301', { statusCode: 301 }],
    ['a 304', { statusCode: 304 }],
    ['no status', {}],
    ["a status that isn't a number", { statusCode: '404' }],
  ])("answers as before when the site's page gave %s", async (_, page) => {
    fetchSpy.mockResolvedValue(answer(200, scraped(BRANDING, page)));

    expect(await lookup()).toStrictEqual(FOUND);
  });

  it.each([
    ['names none', { favicon: 'https://a.example/apple-touch-icon.png' }],
    [
      'names a null one',
      { logo: null, favicon: 'https://a.example/apple-touch-icon.png' },
    ],
  ])("takes the branding's own logo when its images %s", async (_, images) => {
    fetchSpy.mockResolvedValue(branded({ images }));

    expect(await lookup()).toStrictEqual({
      ...FOUND,
      logo: 'https://a.example/logo.png',
    });
  });

  it.each([
    [
      'the secondary',
      { primary: '#1B4D3E', secondary: null, accent: '#D9534F' },
      ['#1B4D3E', '#D9534F'],
    ],
    [
      'the primary',
      { secondary: '#C8A24A', accent: '#D9534F' },
      ['#C8A24A', '#D9534F'],
    ],
    [
      'every colour but the accent',
      { primary: '', accent: '#D9534F', background: '#FFFFFF' },
      ['#D9534F'],
    ],
    [
      'every brand colour',
      { background: '#FFFFFF', textPrimary: '#111111' },
      [],
    ],
  ])(
    'leaves out %s when the site gave none, the rest in the order primary, secondary, accent',
    async (_, colors, colours) => {
      fetchSpy.mockResolvedValue(branded({ colors }));

      expect(await lookup()).toStrictEqual({ ...FOUND, colours });
    }
  );

  // What a kit can take (a hex code, each once, a plain font name) is
  // BrandWebsiteService's to decide, where the kit's limits live.
  it('hands the colours and fonts over as Firecrawl answered them', async () => {
    fetchSpy.mockResolvedValue(
      branded({
        colors: {
          primary: '#6f4e37',
          secondary: 'rgb(255, 255, 255)',
          accent: '#6f4e37',
        },
        typography: {
          fontFamilies: {
            primary: 'IBM Plex Sans-fea3ea334779485b',
            heading: '"Tajawal", sans-serif',
          },
        },
      })
    );

    expect(await lookup()).toStrictEqual({
      ...FOUND,
      colours: ['#6f4e37', 'rgb(255, 255, 255)', '#6f4e37'],
      headingFont: '"Tajawal", sans-serif',
      bodyFont: 'IBM Plex Sans-fea3ea334779485b',
    });
  });

  // Firecrawl's reference marks every part of a branding answer as one that
  // may be null.
  it.each([
    ['logo', FOUND],
    [
      'images',
      {
        url: 'https://www.a.example/ar',
        logo: 'https://a.example/logo.png',
        colours: ['#1B4D3E', '#C8A24A', '#D9534F'],
        headingFont: 'Tajawal',
        bodyFont: 'IBM Plex Sans Arabic',
      },
    ],
    ['colors', { ...FOUND, colours: [] }],
    ['fonts', FOUND],
    [
      'typography',
      {
        url: 'https://www.a.example/ar',
        logo: 'https://cdn.a.example/logo.svg',
        icon: 'https://a.example/apple-touch-icon.png',
        colours: ['#1B4D3E', '#C8A24A', '#D9534F'],
      },
    ],
  ])('answers without what a null %s would have given', async (part, found) => {
    fetchSpy.mockResolvedValue(branded({ [part]: null }));

    expect(await lookup()).toStrictEqual(found);
  });

  it.each([
    ['is empty', {}],
    [
      'has every part null',
      { logo: null, images: null, colors: null, fonts: null, typography: null },
    ],
    [
      'has every part empty',
      { logo: '', images: {}, colors: {}, fonts: [], typography: {} },
    ],
    [
      'has every value null',
      {
        logo: null,
        images: { logo: null, favicon: null, ogImage: null },
        colors: { primary: null, secondary: null, accent: null },
        fonts: [],
        typography: { fontFamilies: { primary: null, heading: null } },
      },
    ],
    ['has null font families', { typography: { fontFamilies: null } }],
  ])(
    'answers the address alone, with no colours, when the branding %s',
    async (_, branding) => {
      fetchSpy.mockResolvedValue(answer(200, scraped(branding)));

      expect(await lookup()).toStrictEqual({
        url: 'https://www.a.example/ar',
        colours: [],
      });
    }
  );

  // A link in Firecrawl's answer is the site's own text, and readOrFetch, which
  // reads a logo next, opens any string that doesn't start with a lower-case
  // "http" as a local file's path.
  it.each([
    ['a relative path', '/assets/logo.png'],
    ['a file name', 'logo-dark.png'],
    ['an address with no scheme', '//cdn.a.example/logo.png'],
    ['a data: address', 'data:image/svg+xml;base64,PHN2Zy8+'],
    ['a file: address', 'file:///etc/passwd'],
    ['an ftp: address', 'ftp://a.example/logo.png'],
  ])('leaves out a logo and an icon given as %s', async (_, link) => {
    fetchSpy.mockResolvedValue(
      branded({ logo: link, images: { logo: link, favicon: link } })
    );

    expect(await lookup()).toStrictEqual({
      url: 'https://www.a.example/ar',
      colours: ['#1B4D3E', '#C8A24A', '#D9534F'],
      headingFont: 'Tajawal',
      bodyFont: 'IBM Plex Sans Arabic',
    });
  });

  it("takes the branding's own logo when its images' logo isn't an http(s) link", async () => {
    fetchSpy.mockResolvedValue(
      branded({
        images: {
          logo: 'data:image/svg+xml;base64,PHN2Zy8+',
          favicon: 'https://a.example/apple-touch-icon.png',
        },
      })
    );

    expect(await lookup()).toStrictEqual({
      ...FOUND,
      logo: 'https://a.example/logo.png',
    });
  });

  it('hands a link on as parsed, so its scheme is in lower case', async () => {
    fetchSpy.mockResolvedValue(
      branded({
        images: {
          logo: 'HTTPS://CDN.A.Example/Logo.svg',
          favicon: 'HTTP://A.Example/icon.png',
        },
      })
    );

    expect(await lookup()).toStrictEqual({
      ...FOUND,
      logo: 'https://cdn.a.example/Logo.svg',
      icon: 'http://a.example/icon.png',
    });
  });
});

describe('FirecrawlService.branding failures', () => {
  // The status decides, and the code only tells a site that couldn't be read
  // from Firecrawl's own failure on a 500: a timed-out scrape is a 408 with a
  // SCRAPE_ code, and the 429 is documented with neither `success` nor `code`.
  it.each([
    [
      'no credits left',
      402,
      402,
      CREDITS,
      { success: false, error: 'Payment Required: Insufficient credits' },
    ],
    ['too many requests', 429, 429, BUSY, { error: 'Rate limit exceeded' }],
    [
      'a scrape that timed out',
      408,
      504,
      TOO_LONG,
      {
        success: false,
        code: 'SCRAPE_TIMEOUT',
        error: 'The request timed out',
      },
    ],
    [
      'a request that timed out, with no code',
      408,
      504,
      TOO_LONG,
      { success: false, error: 'Request timed out' },
    ],
    [
      "a site it doesn't support",
      403,
      403,
      SITE_REFUSED,
      { success: false, error: 'We do not support this site' },
    ],
    [
      'a key without permission',
      403,
      403,
      SITE_REFUSED,
      { success: false, error: 'Forbidden' },
    ],
    [
      'a site it reads no branding from',
      400,
      403,
      SITE_REFUSED,
      {
        success: false,
        code: 'THIRD_PARTY_DATA_UNSUPPORTED_OPTION',
        error: 'This option is not supported for this site',
      },
    ],
    [
      'a request it finds invalid',
      400,
      403,
      SITE_REFUSED,
      { success: false, error: 'Bad Request', details: [{ path: ['url'] }] },
    ],
    [
      "a site whose name doesn't resolve",
      500,
      422,
      SITE_UNREADABLE,
      {
        success: false,
        code: 'SCRAPE_DNS_RESOLUTION_ERROR',
        error: 'DNS resolution failed',
      },
    ],
    [
      'a site with a broken certificate',
      500,
      422,
      SITE_UNREADABLE,
      { success: false, code: 'SCRAPE_SSL_ERROR', error: 'SSL error' },
    ],
    [
      "a site that couldn't be read, with a code alone",
      500,
      422,
      SITE_UNREADABLE,
      { code: 'SCRAPE_SITE_ERROR' },
    ],
    [
      'its own failure, UNKNOWN_ERROR',
      500,
      503,
      UNREACHABLE,
      { success: false, code: 'UNKNOWN_ERROR', error: 'Unexpected error' },
    ],
    [
      'its own failure, with no code',
      500,
      503,
      UNREACHABLE,
      { success: false, error: 'Internal server error' },
    ],
    ['its own failure, with a null body', 500, 503, UNREACHABLE, null],
    [
      "its own failure, with a code that isn't text",
      500,
      503,
      UNREACHABLE,
      { success: false, code: 500 },
    ],
    [
      'a SCRAPE_ code on another 5xx',
      503,
      503,
      UNREACHABLE,
      { success: false, code: 'SCRAPE_SITE_ERROR' },
    ],
    [
      'a gateway failure',
      502,
      503,
      UNREACHABLE,
      { success: false, error: 'Bad gateway' },
    ],
    [
      "a key it doesn't know",
      401,
      502,
      REFUSED,
      { success: false, error: 'Unauthorized: Invalid token' },
    ],
    [
      'an address it has no route for',
      404,
      502,
      REFUSED,
      { success: false, error: 'Not found' },
    ],
    [
      'a body it finds too large',
      413,
      502,
      REFUSED,
      { success: false, error: 'Payload too large' },
    ],
    [
      'a request it cannot process',
      422,
      502,
      REFUSED,
      { success: false, error: 'Unprocessable' },
    ],
  ])(
    '%s: turns a %i from Firecrawl into a %i',
    async (_, firecrawl, status, message, body) => {
      fetchSpy.mockResolvedValue(answer(firecrawl, body));

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(status);
      expect(err.message).toBe(message);
    }
  );

  // A gateway in front of Firecrawl may answer with a page rather than JSON.
  it.each([
    [402, 402, CREDITS],
    [429, 429, BUSY],
    [408, 504, TOO_LONG],
    [403, 403, SITE_REFUSED],
    [400, 403, SITE_REFUSED],
    [500, 503, UNREACHABLE],
    [502, 503, UNREACHABLE],
    [401, 502, REFUSED],
  ])(
    "turns a %i whose body isn't JSON into a %i, by its status alone",
    async (firecrawl, status, message) => {
      fetchSpy.mockResolvedValue(
        new Response('<html><body>Bad gateway</body></html>', {
          status: firecrawl,
          headers: { 'Content-Type': 'text/html' },
        })
      );

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(status);
      expect(err.message).toBe(message);
    }
  );

  it.each([
    [
      'no branding',
      {
        success: true,
        data: { metadata: { url: 'https://www.a.example/ar' } },
      },
    ],
    [
      'a null branding',
      {
        success: true,
        data: { branding: null, metadata: { url: 'https://www.a.example/ar' } },
      },
    ],
    ['no data', { success: true }],
    ['a null body', null],
  ])(
    "says the site couldn't be read when the answer has %s",
    async (_, body) => {
      fetchSpy.mockResolvedValue(answer(200, body));

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(err.message).toBe(SITE_UNREADABLE);
    }
  );

  // Firecrawl answers 200 with `success: true` when the site's page itself
  // answered an error, a 404 or a block page, and gives that status in the
  // metadata. What it read is the error page's, not the site's.
  it.each([
    [400, "the error page's branding", BRANDING],
    [403, "the error page's branding", BRANDING],
    [404, "the error page's branding", BRANDING],
    [500, "the error page's branding", BRANDING],
    [503, "the error page's branding", BRANDING],
    [403, 'no branding', null],
    [404, 'no branding', null],
    [500, 'no branding', null],
    [503, 'no branding', null],
  ])(
    "says the site couldn't be read when its page answered a %i, with %s",
    async (statusCode, _, branding) => {
      fetchSpy.mockResolvedValue(
        answer(200, scraped(branding, { statusCode }))
      );

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(err.message).toBe(SITE_UNREADABLE);
    }
  );

  it('says Firecrawl could not be reached when the request never gets there', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const err = await rejection(lookup());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toBe(UNREACHABLE);
  });

  it("says Firecrawl could not be reached when its answer isn't JSON", async () => {
    fetchSpy.mockResolvedValue(
      new Response('<html><body>OK</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const err = await rejection(lookup());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toBe(UNREACHABLE);
  });

  it.each(['TimeoutError', 'AbortError'])(
    'says the lookup took too long when fetch gives up (%s)',
    async (name) => {
      fetchSpy.mockRejectedValue(
        new DOMException('The operation was aborted', name)
      );

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(504);
      expect(err.message).toBe(TOO_LONG);
    }
  );

  // The 30 seconds cover reading the answer too, not only its first bytes.
  it('says the lookup took too long when the answer stops arriving', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.reject(
          new DOMException('The operation was aborted', 'TimeoutError')
        ),
    });

    const err = await rejection(lookup());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(504);
    expect(err.message).toBe(TOO_LONG);
  });
});

describe('FirecrawlService.search', () => {
  // No maxAge and no country are sent, so Firecrawl's defaults apply.
  it("asks Firecrawl for 5 web results to the question, with the key and 15 seconds of Firecrawl's time", async () => {
    fetchSpy.mockResolvedValue(answer(200, searched([])));

    await search();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.firecrawl.dev/v2/search');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer fc-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      query: 'سوق الخبر',
      limit: 5,
      sources: ['web'],
      timeout: 15000,
    });
  });

  it('gives the call 20 seconds', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchSpy.mockResolvedValue(answer(200, searched([])));

    await search();

    expect(timeout).toHaveBeenCalledWith(20_000);
    expect(fetchSpy.mock.calls[0][1].signal).toBe(
      timeout.mock.results[0].value
    );
  });

  it("answers each result as { title, url, snippet }, the snippet being Firecrawl's description, and nothing else of Firecrawl's", async () => {
    fetchSpy.mockResolvedValue(
      answer(
        200,
        searched([
          {
            title: 'Souq Al Khobar',
            url: 'https://a.example/souq',
            description: 'A market by the corniche.',
            position: 1,
            category: 'web',
          },
          {
            title: 'Khobar guide',
            url: 'https://b.example/guide',
            description: 'Where to eat and shop.',
            position: 2,
          },
        ])
      )
    );

    const found: WebResult[] = [
      {
        title: 'Souq Al Khobar',
        url: 'https://a.example/souq',
        snippet: 'A market by the corniche.',
      },
      {
        title: 'Khobar guide',
        url: 'https://b.example/guide',
        snippet: 'Where to eat and shop.',
      },
    ];
    expect(await search()).toStrictEqual(found);
  });

  it.each([
    ['finds none', searched([])],
    ['answers with no web results', { success: true, data: {} }],
  ])('answers no results when Firecrawl %s', async (_, body) => {
    fetchSpy.mockResolvedValue(answer(200, body));

    expect(await search()).toStrictEqual([]);
  });

  // Mastra checks the tool's answer against its output schema, so one result
  // with no title or snippet would fail the whole search.
  it('answers a missing title or snippet as an empty one', async () => {
    fetchSpy.mockResolvedValue(
      answer(
        200,
        searched([
          {
            title: 'Souq Al Khobar',
            url: 'https://a.example/souq',
            description: null,
          },
          { url: 'https://b.example/guide', description: 'Where to eat.' },
          {
            title: 'Khobar corniche',
            url: 'https://c.example/corniche',
            description: 'A walk by the sea.',
          },
        ])
      )
    );

    expect(await search()).toStrictEqual([
      { title: 'Souq Al Khobar', url: 'https://a.example/souq', snippet: '' },
      { title: '', url: 'https://b.example/guide', snippet: 'Where to eat.' },
      {
        title: 'Khobar corniche',
        url: 'https://c.example/corniche',
        snippet: 'A walk by the sea.',
      },
    ]);
  });
});

describe('FirecrawlService.search failures', () => {
  // A search names no site, so what a scrape would say of one is, to a
  // search, a request refused or Firecrawl's own failure.
  it.each([
    [
      'a request it finds invalid',
      400,
      502,
      REFUSED,
      { success: false, error: 'Bad Request', details: [{ path: ['query'] }] },
    ],
    [
      'a key without permission',
      403,
      502,
      REFUSED,
      { success: false, error: 'Forbidden' },
    ],
    [
      'a SCRAPE_ code on a 500',
      500,
      503,
      UNREACHABLE,
      { success: false, code: 'SCRAPE_SITE_ERROR' },
    ],
  ])(
    '%s: turns a %i from Firecrawl into a %i',
    async (_, firecrawl, status, message, body) => {
      fetchSpy.mockResolvedValue(answer(firecrawl, body));

      const err = await rejection(search());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(status);
      expect(err.message).toBe(message);
    }
  );

  it.each([400, 403])(
    "turns a %i whose body isn't JSON into a 502, by its status alone",
    async (firecrawl) => {
      fetchSpy.mockResolvedValue(notJson(firecrawl));

      const err = await rejection(search());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(502);
      expect(err.message).toBe(REFUSED);
    }
  );
});

describe('FirecrawlService.read', () => {
  // No maxAge and no country are sent, so Firecrawl's defaults apply.
  it("asks Firecrawl to scrape each address as markdown, a PDF's first 3 pages only, with the key and 15 seconds of Firecrawl's time", async () => {
    answering({
      'https://a.example/': () => answer(200, markdown('Page A')),
      'https://b.example/menu': () => answer(200, markdown('Menu')),
    });

    await read(['https://a.example/', 'https://b.example/menu']);

    expect(
      fetchSpy.mock.calls.map(([url, init]) => ({
        url,
        method: init.method,
        headers: init.headers,
        body: JSON.parse(init.body),
      }))
    ).toEqual(
      ['https://a.example/', 'https://b.example/menu'].map((address) => ({
        url: 'https://api.firecrawl.dev/v2/scrape',
        method: 'POST',
        headers: {
          Authorization: 'Bearer fc-test',
          'Content-Type': 'application/json',
        },
        body: {
          url: address,
          formats: [{ type: 'markdown' }],
          parsers: [{ type: 'pdf', maxPages: 3 }],
          timeout: 15000,
        },
      }))
    );
  });

  it('gives each call 20 seconds of its own', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    answering({
      'https://a.example/': () => answer(200, markdown('Page A')),
      'https://b.example/': () => answer(200, markdown('Page B')),
    });

    await read(['https://a.example/', 'https://b.example/']);

    expect(timeout.mock.calls).toEqual([[20_000], [20_000]]);
    fetchSpy.mock.calls.forEach(([, init], i) =>
      expect(init.signal).toBe(timeout.mock.results[i].value)
    );
  });

  it('asks for every address at once, and answers one page per address in the order asked, whichever Firecrawl answers first', async () => {
    const replies: Record<string, (reply: Response) => void> = {};
    fetchSpy.mockImplementation(
      (_, init) =>
        new Promise((resolve) => {
          replies[JSON.parse(init.body).url] = resolve;
        })
    );

    const reading = read([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
    ]);
    await new Promise((resolve) => setImmediate(resolve));

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    replies['https://c.example/'](answer(200, markdown('Page C')));
    replies['https://b.example/'](answer(200, markdown('Page B')));
    replies['https://a.example/'](answer(200, markdown('Page A')));
    expect(await reading).toStrictEqual([
      { url: 'https://a.example/', text: 'Page A' },
      { url: 'https://b.example/', text: 'Page B' },
      { url: 'https://c.example/', text: 'Page C' },
    ]);
  });

  // Each answer belongs to the call that asked, so the page keeps the address
  // asked, wherever the site led.
  it("answers each page as the address asked and its words, and nothing else of Firecrawl's", async () => {
    fetchSpy.mockResolvedValue(
      answer(
        200,
        markdown('# Menu\n\nKunafa', {
          url: 'https://www.a.example/ar/menu',
          title: 'Menu',
          language: 'ar',
        })
      )
    );

    const pages: WebPage[] = [
      { url: 'https://a.example/menu', text: '# Menu\n\nKunafa' },
    ];
    expect(await read(['https://a.example/menu'])).toStrictEqual(pages);
  });

  // Only an error from the page itself makes it one that couldn't be read.
  it.each([
    ['a 200', markdown('Kunafa', { statusCode: 200 })],
    ['a 301', markdown('Kunafa', { statusCode: 301 })],
    [
      'no status',
      { success: true, data: { markdown: 'Kunafa', metadata: {} } },
    ],
    ['no metadata', { success: true, data: { markdown: 'Kunafa' } }],
    ["a status that isn't a number", markdown('Kunafa', { statusCode: '404' })],
  ])('reads a page as before when its answer gives %s', async (_, body) => {
    fetchSpy.mockResolvedValue(answer(200, body));

    expect(await read()).toStrictEqual([
      { url: 'https://a.example/', text: 'Kunafa' },
    ]);
  });

  // The text is stored in the thread and sent to the model again on every
  // later turn, so a long page would be paid for on each of them.
  it('cuts text over 8,000 characters at 8,000 and says so after a blank line', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, markdown(`${'a'.repeat(8_000)}${'b'.repeat(500)}`))
    );

    const [page] = await read();

    expect(page.text).toBe(
      `${'a'.repeat(8_000)}\n\n[Cut at 8,000 characters.]`
    );
  });

  it('leaves text of 8,000 characters or fewer as it is', async () => {
    answering({
      'https://a.example/': () => answer(200, markdown('a'.repeat(8_000))),
      'https://b.example/': () => answer(200, markdown('# Menu\n\nKunafa')),
    });

    expect(
      await read(['https://a.example/', 'https://b.example/'])
    ).toStrictEqual([
      { url: 'https://a.example/', text: 'a'.repeat(8_000) },
      { url: 'https://b.example/', text: '# Menu\n\nKunafa' },
    ]);
  });

  // Samy reads a page's words only: the addresses of its images aren't Samy's
  // to use, and on a page full of them they used up the 8,000 characters.
  it.each([
    [
      'images, keeping the words around them',
      [
        '# PKHUB',
        '',
        '![PKHUB](https://pkhub.info/logo.svg)',
        '',
        'Games and apps.',
        '',
        '![Banner](https://pkhub.info/banner.png)',
        '',
        '![Flag](https://pkhub.info/flag.svg)',
        '',
        'Download now.',
      ].join('\n'),
      '# PKHUB\n\nGames and apps.\n\nDownload now.',
    ],
    [
      'an image whose address has a space',
      'Welcome\n\n![PKHUB](https://pkhub.info/assets/app/Logo wrap.svg)\n\nGames and apps.',
      'Welcome\n\nGames and apps.',
    ],
    [
      'a linked image, link and all',
      '[![PKHUB](https://pkhub.info/logo.svg)](https://pkhub.info/)\n\nGames and apps.',
      'Games and apps.',
    ],
  ])('removes %s', async (_, text, words) => {
    fetchSpy.mockResolvedValue(answer(200, markdown(text)));

    expect(await read()).toStrictEqual([
      { url: 'https://a.example/', text: words },
    ]);
  });

  // Samy follows a page's own links to find the page it needs.
  it('keeps the links in the text', async () => {
    fetchSpy.mockResolvedValue(
      answer(
        200,
        markdown(
          '[Menu](https://a.example/menu) | [Contact us](https://a.example/contact)\n\n![Logo](https://a.example/logo.svg)\n\nKunafa'
        )
      )
    );

    const [page] = await read();

    expect(page.text).toBe(
      '[Menu](https://a.example/menu) | [Contact us](https://a.example/contact)\n\nKunafa'
    );
  });

  it('cuts at 8,000 characters of words, not counting the images removed', async () => {
    // 100 characters, the blank line after it included.
    const image = `![Flag](https://a.example/${'f'.repeat(67)}.svg)\n\n`;
    fetchSpy.mockResolvedValue(
      answer(200, markdown(`${image.repeat(10)}${'a'.repeat(7_500)}`))
    );

    const [page] = await read();

    expect(page.text).toBe('a'.repeat(7_500));
  });

  // A PDF is read for its first 3 pages, and Firecrawl says how many it has.
  it('ends the text of a PDF with more pages than were read with a note naming the pages read', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, markdown('Filing status', { numPages: 3, totalPages: 142 }))
    );

    const [page] = await read(['https://a.example/p17.pdf']);

    expect(page.text).toBe('Filing status\n\n[Cut at page 3 of 142.]');
  });

  it.each([
    ['a PDF read whole', { numPages: 2, totalPages: 2 }],
    ['a page that is no PDF', {}],
  ])('adds no note to %s', async (_, metadata) => {
    fetchSpy.mockResolvedValue(
      answer(200, markdown('Filing status', metadata))
    );

    const [page] = await read(['https://a.example/p17.pdf']);

    expect(page.text).toBe('Filing status');
  });

  it("ends a PDF's text over 8,000 characters with the cut's own note alone", async () => {
    fetchSpy.mockResolvedValue(
      answer(
        200,
        markdown(`${'a'.repeat(8_000)}${'b'.repeat(500)}`, {
          numPages: 3,
          totalPages: 142,
        })
      )
    );

    const [page] = await read(['https://a.example/p17.pdf']);

    expect(page.text).toBe(
      `${'a'.repeat(8_000)}\n\n[Cut at 8,000 characters.]`
    );
  });
});

describe('FirecrawlService.read, page by page', () => {
  const both = ['https://a.example/', 'https://b.example/'];

  // What Firecrawl says of the page itself is that page's reason, and the
  // other pages of the read are still read.
  it.each([
    [
      "a site it doesn't support",
      () =>
        answer(403, { success: false, error: 'We do not support this site' }),
      PAGE_REFUSED,
    ],
    ["a 403 whose body isn't JSON", () => notJson(403), PAGE_REFUSED],
    [
      'a request it finds invalid',
      () =>
        answer(400, {
          success: false,
          error: 'Bad Request',
          details: [{ path: ['url'] }],
        }),
      UNREADABLE,
    ],
    ["a 400 whose body isn't JSON", () => notJson(400), UNREADABLE],
    [
      "a site whose name doesn't resolve",
      () =>
        answer(500, {
          success: false,
          code: 'SCRAPE_DNS_RESOLUTION_ERROR',
          error: 'DNS resolution failed',
        }),
      UNREADABLE,
    ],
    [
      'a site with a broken certificate',
      () =>
        answer(500, {
          success: false,
          code: 'SCRAPE_SSL_ERROR',
          error: 'SSL error',
        }),
      UNREADABLE,
    ],
    [
      'a file it reads no text from',
      () =>
        answer(500, {
          success: false,
          code: 'SCRAPE_UNSUPPORTED_FILE_ERROR',
          error: 'Unsupported file type',
        }),
      UNREADABLE,
    ],
    [
      "a page that couldn't be read, with a code alone",
      () => answer(500, { code: 'SCRAPE_SITE_ERROR' }),
      UNREADABLE,
    ],
    ['no text', () => answer(200, markdown('')), UNREADABLE],
    [
      'no markdown',
      () =>
        answer(200, { success: true, data: { metadata: { statusCode: 200 } } }),
      UNREADABLE,
    ],
    [
      'nothing but images',
      () =>
        answer(
          200,
          markdown(
            '![Logo](https://a.example/logo.svg)\n\n[![Sale](https://a.example/sale.png)](https://a.example/sale)\n'
          )
        ),
      UNREADABLE,
    ],
    ['no data', () => answer(200, { success: true }), UNREADABLE],
    ['a null body', () => answer(200, null), UNREADABLE],
  ])(
    "gives a page Firecrawl answers with %s that page's reason, and reads the others",
    async (_, reply, error) => {
      answering({
        'https://a.example/': reply,
        'https://b.example/': () => answer(200, markdown('Page B')),
      });

      expect(await read(both)).toStrictEqual([
        { url: 'https://a.example/', error },
        { url: 'https://b.example/', text: 'Page B' },
      ]);
    }
  );

  // Firecrawl answers 200 with `success: true` when the page itself answered
  // an error, a 404 or a block page, and gives that status in the metadata.
  // What it read is the error page's, not the page asked for.
  it.each([400, 403, 404, 500, 503])(
    "says a page that itself answered a %i couldn't be read, and reads the others",
    async (statusCode) => {
      answering({
        'https://a.example/': () =>
          answer(
            200,
            markdown('# Not found\n\nThe page you asked for is gone.', {
              statusCode,
            })
          ),
        'https://b.example/': () => answer(200, markdown('Page B')),
      });

      expect(await read(both)).toStrictEqual([
        { url: 'https://a.example/', error: UNREADABLE },
        { url: 'https://b.example/', text: 'Page B' },
      ]);
    }
  );

  // The service failing one call of several is that page's reason, in the
  // words it fails the whole read with when it fails every call.
  it.each([
    [
      'no credits left',
      () =>
        answer(402, {
          success: false,
          error: 'Payment Required: Insufficient credits',
        }),
      CREDITS,
    ],
    [
      'too many requests',
      () => answer(429, { error: 'Rate limit exceeded' }),
      BUSY,
    ],
    [
      'a scrape that timed out',
      () =>
        answer(408, {
          success: false,
          code: 'SCRAPE_TIMEOUT',
          error: 'The request timed out',
        }),
      TOO_LONG,
    ],
    [
      'its own failure',
      () =>
        answer(500, {
          success: false,
          code: 'UNKNOWN_ERROR',
          error: 'Unexpected error',
        }),
      UNREACHABLE,
    ],
    ['a gateway failure', () => notJson(502), UNREACHABLE],
    [
      "a key it doesn't know",
      () =>
        answer(401, { success: false, error: 'Unauthorized: Invalid token' }),
      REFUSED,
    ],
    [
      'a request it cannot process',
      () => answer(422, { success: false, error: 'Unprocessable' }),
      REFUSED,
    ],
    [
      'no answer, the call never getting there',
      () => Promise.reject(new TypeError('fetch failed')),
      UNREACHABLE,
    ],
    [
      'no answer before the call gives up',
      () =>
        Promise.reject(
          new DOMException('The operation was aborted', 'TimeoutError')
        ),
      TOO_LONG,
    ],
    ['an answer that stops arriving', stalled, TOO_LONG],
    [
      "an answer that isn't JSON",
      () =>
        new Response('<html><body>OK</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      UNREACHABLE,
    ],
  ])(
    "gives a page whose call fails with %s the service's reason, and reads the others",
    async (_, reply, error) => {
      answering({
        'https://a.example/': reply,
        'https://b.example/': () => answer(200, markdown('Page B')),
      });

      expect(await read(both)).toStrictEqual([
        { url: 'https://a.example/', error },
        { url: 'https://b.example/', text: 'Page B' },
      ]);
    }
  );

  // Nothing could be read, so the tool answers { error } for the read.
  it("fails the read with the first page's reason when the service failed every page, whichever failed first", async () => {
    answering({
      'https://a.example/': () =>
        new Promise((resolve) => setImmediate(() => resolve(answer(429)))),
      'https://b.example/': () => answer(402),
      'https://c.example/': () => Promise.reject(new TypeError('fetch failed')),
    });

    const err = await rejection(
      read(['https://a.example/', 'https://b.example/', 'https://c.example/'])
    );

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(err.message).toBe(BUSY);
  });

  // Nothing was read, but not for the service's reason alone: each page keeps
  // its own, which Samy can relay page by page.
  it("answers every page's reason when some failed for their own and the rest for the service's", async () => {
    answering({
      'https://a.example/': () => answer(402),
      'https://b.example/': () => answer(403),
      'https://c.example/': () => answer(200, markdown('')),
    });

    expect(
      await read([
        'https://a.example/',
        'https://b.example/',
        'https://c.example/',
      ])
    ).toStrictEqual([
      { url: 'https://a.example/', error: CREDITS },
      { url: 'https://b.example/', error: PAGE_REFUSED },
      { url: 'https://c.example/', error: UNREADABLE },
    ]);
  });

  it.each([
    ["a site it doesn't support", () => answer(403), PAGE_REFUSED],
    [
      "a page that couldn't be read",
      () => answer(500, { code: 'SCRAPE_SITE_ERROR' }),
      UNREADABLE,
    ],
    [
      'a page that itself answered a 404',
      () => answer(200, markdown('Not found', { statusCode: 404 })),
      UNREADABLE,
    ],
  ])(
    "answers a read of one page that failed for its own reason, %s, with that page's reason",
    async (_, reply, error) => {
      answering({ 'https://a.example/': reply });

      expect(await read()).toStrictEqual([
        { url: 'https://a.example/', error },
      ]);
    }
  );
});

// Everything but what Firecrawl says of a site is the service's own failure,
// which fails a search, and a read when it fails every page of it.
describe.each([
  ['search', search],
  ['read of one page', () => read()],
])('FirecrawlService %s failures', (_, call) => {
  it.each([
    [
      'no credits left',
      402,
      402,
      CREDITS,
      { success: false, error: 'Payment Required: Insufficient credits' },
    ],
    ['too many requests', 429, 429, BUSY, { error: 'Rate limit exceeded' }],
    [
      'a call that timed out',
      408,
      504,
      TOO_LONG,
      {
        success: false,
        code: 'SCRAPE_TIMEOUT',
        error: 'The request timed out',
      },
    ],
    [
      'a request that timed out, with no code',
      408,
      504,
      TOO_LONG,
      { success: false, error: 'Request timed out' },
    ],
    [
      'its own failure, UNKNOWN_ERROR',
      500,
      503,
      UNREACHABLE,
      { success: false, code: 'UNKNOWN_ERROR', error: 'Unexpected error' },
    ],
    [
      'its own failure, with no code',
      500,
      503,
      UNREACHABLE,
      { success: false, error: 'Internal server error' },
    ],
    ['its own failure, with a null body', 500, 503, UNREACHABLE, null],
    [
      'a SCRAPE_ code on another 5xx',
      503,
      503,
      UNREACHABLE,
      { success: false, code: 'SCRAPE_SITE_ERROR' },
    ],
    [
      'a gateway failure',
      502,
      503,
      UNREACHABLE,
      { success: false, error: 'Bad gateway' },
    ],
    [
      "a key it doesn't know",
      401,
      502,
      REFUSED,
      { success: false, error: 'Unauthorized: Invalid token' },
    ],
    [
      'an address it has no route for',
      404,
      502,
      REFUSED,
      { success: false, error: 'Not found' },
    ],
    [
      'a body it finds too large',
      413,
      502,
      REFUSED,
      { success: false, error: 'Payload too large' },
    ],
    [
      'a request it cannot process',
      422,
      502,
      REFUSED,
      { success: false, error: 'Unprocessable' },
    ],
  ])(
    '%s: turns a %i from Firecrawl into a %i',
    async (_, firecrawl, status, message, body) => {
      fetchSpy.mockResolvedValue(answer(firecrawl, body));

      const err = await rejection(call());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(status);
      expect(err.message).toBe(message);
    }
  );

  it.each([
    [402, 402, CREDITS],
    [429, 429, BUSY],
    [408, 504, TOO_LONG],
    [500, 503, UNREACHABLE],
    [502, 503, UNREACHABLE],
    [401, 502, REFUSED],
  ])(
    "turns a %i whose body isn't JSON into a %i, by its status alone",
    async (firecrawl, status, message) => {
      fetchSpy.mockResolvedValue(notJson(firecrawl));

      const err = await rejection(call());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(status);
      expect(err.message).toBe(message);
    }
  );

  it('says Firecrawl could not be reached when the request never gets there', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const err = await rejection(call());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toBe(UNREACHABLE);
  });

  it("says Firecrawl could not be reached when its answer isn't JSON", async () => {
    fetchSpy.mockResolvedValue(
      new Response('<html><body>OK</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const err = await rejection(call());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(503);
    expect(err.message).toBe(UNREACHABLE);
  });

  it.each(['TimeoutError', 'AbortError'])(
    'says the lookup took too long when fetch gives up (%s)',
    async (name) => {
      fetchSpy.mockRejectedValue(
        new DOMException('The operation was aborted', name)
      );

      const err = await rejection(call());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(504);
      expect(err.message).toBe(TOO_LONG);
    }
  );

  // The 20 seconds cover reading the answer too, not only its first bytes.
  it('says the lookup took too long when the answer stops arriving', async () => {
    fetchSpy.mockResolvedValue(stalled());

    const err = await rejection(call());

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(504);
    expect(err.message).toBe(TOO_LONG);
  });
});

// Every organization draws on one monthly Firecrawl credit pool, watched from
// these lines rather than from Firecrawl's dashboard.
describe('FirecrawlService log', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(1_250);
  });

  it('writes one WebLookup line for a brand lookup', async () => {
    fetchSpy.mockResolvedValue(answer(200, scraped()));

    await lookup();

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'brand', ok: true, ms: 250 },
        context: 'WebLookup',
      },
    ]);
  });

  it.each([
    [
      'Firecrawl refuses the site',
      () => fetchSpy.mockResolvedValue(answer(403)),
    ],
    [
      "Firecrawl can't be reached",
      () => fetchSpy.mockRejectedValue(new TypeError('fetch failed')),
    ],
    [
      'the answer has no branding',
      () => fetchSpy.mockResolvedValue(answer(200, { success: true })),
    ],
    [
      "the site's page answered an error",
      () =>
        fetchSpy.mockResolvedValue(
          answer(200, scraped(BRANDING, { statusCode: 404 }))
        ),
    ],
  ])(
    'writes one line for a brand lookup that fails because %s',
    async (_, fails) => {
      fails();

      await rejection(lookup());

      expect(logged).toEqual([
        {
          line: { org: 'org-1', kind: 'brand', ok: false, ms: 250 },
          context: 'WebLookup',
        },
      ]);
    }
  );

  it('writes one WebLookup line for a search', async () => {
    fetchSpy.mockResolvedValue(answer(200, searched([])));

    await search();

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'search', ok: true, ms: 250 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes one line for a failed search', async () => {
    fetchSpy.mockResolvedValue(answer(402));

    await rejection(search());

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'search', ok: false, ms: 250 },
        context: 'WebLookup',
      },
    ]);
  });

  // One line for the read, however many pages it asked for. It counts the
  // pages that came back with text, and the read still counts as answered
  // when some of its pages failed.
  it('writes one WebLookup line for a read, with the pages read', async () => {
    answering({
      'https://a.example/': () => answer(200, markdown('Page A')),
      'https://b.example/': () => answer(402),
      'https://c.example/': () => answer(403),
      'https://d.example/': () => answer(200, markdown('Page D')),
    });

    await read([
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
    ]);

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'read', ok: true, ms: 250, pages: 2 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes one line for a read that answers with no page read', async () => {
    fetchSpy.mockResolvedValue(answer(403));

    await read(['https://a.example/', 'https://b.example/']);

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'read', ok: true, ms: 250, pages: 0 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes one line for a failed read, with no pages read', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    await rejection(read(['https://a.example/', 'https://b.example/']));

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'read', ok: false, ms: 250, pages: 0 },
        context: 'WebLookup',
      },
    ]);
  });

  describe('with a logger that throws', () => {
    beforeEach(() => {
      logSpy.mockImplementation(() => {
        throw new Error('transport down');
      });
    });

    it('still answers a brand lookup', async () => {
      fetchSpy.mockResolvedValue(answer(200, scraped()));

      expect(await lookup()).toStrictEqual(FOUND);
    });

    it("still fails with Firecrawl's reason, not the logger's", async () => {
      fetchSpy.mockResolvedValue(answer(429));

      const err = await rejection(lookup());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.message).toBe(BUSY);
    });

    it('still answers a search', async () => {
      fetchSpy.mockResolvedValue(
        answer(
          200,
          searched([
            {
              title: 'Souq',
              url: 'https://a.example/',
              description: 'Market',
            },
          ])
        )
      );

      expect(await search()).toStrictEqual([
        { title: 'Souq', url: 'https://a.example/', snippet: 'Market' },
      ]);
    });

    it('still answers a read', async () => {
      fetchSpy.mockResolvedValue(answer(200, markdown('Page A')));

      expect(await read()).toStrictEqual([
        { url: 'https://a.example/', text: 'Page A' },
      ]);
    });

    it.each([
      ['search', search],
      ['read', () => read()],
    ])(
      "still fails a %s with Firecrawl's reason, not the logger's",
      async (_, call) => {
        fetchSpy.mockResolvedValue(answer(429));

        const err = await rejection(call());

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(429);
        expect(err.message).toBe(BUSY);
      }
    );
  });
});
