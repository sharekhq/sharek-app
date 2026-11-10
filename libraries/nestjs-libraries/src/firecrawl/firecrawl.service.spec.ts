import { HttpException, Logger } from '@nestjs/common';
import {
  FirecrawlService,
  SiteBranding,
} from '@gitroom/nestjs-libraries/firecrawl/firecrawl.service';

// The service's own failures keep tavily.service.ts's wording, word for word.
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

const answer = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  });
});
