import { HttpException, Logger } from '@nestjs/common';
import { TavilyService } from '@gitroom/nestjs-libraries/tavily/tavily.service';

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

const UNREADABLE = "This page couldn't be read.";

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

const calls = {
  search: (service: TavilyService) => service.search('org-1', 'سوق الخبر'),
  extract: (service: TavilyService) =>
    service.extract('org-1', ['https://a.example/']),
};

let fetchSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
let logged: { line: any; context: string }[];

beforeEach(() => {
  process.env.TAVILY_API_KEY = 'tvly-test';
  // Every case answers for Tavily itself; nothing reaches the network.
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
  delete process.env.TAVILY_API_KEY;
});

describe('TavilyService.search', () => {
  it('asks Tavily for 5 basic results with no written answer and no page content, with the key', async () => {
    fetchSpy.mockResolvedValue(answer(200, { results: [] }));

    await new TavilyService().search('org-1', 'سوق الخبر');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer tvly-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      query: 'سوق الخبر',
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    });
  });

  it("answers each result as { title, url, snippet }, the snippet being Tavily's content", async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        query: 'سوق الخبر',
        results: [
          {
            title: 'Souq Al Khobar',
            url: 'https://a.example/souq',
            content: 'A market by the corniche.',
            score: 0.81,
            raw_content: null,
          },
          {
            title: 'Khobar guide',
            url: 'https://b.example/guide',
            content: 'Where to eat and shop.',
            score: 0.64,
            raw_content: null,
          },
        ],
        response_time: 1.2,
      })
    );

    expect(await new TavilyService().search('org-1', 'سوق الخبر')).toEqual([
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
    ]);
  });

  it('answers no results when Tavily finds none', async () => {
    fetchSpy.mockResolvedValue(answer(200, { results: [] }));

    expect(await new TavilyService().search('org-1', 'سوق الخبر')).toEqual([]);
  });

  // Mastra checks the tool's answer against its output schema, so one result
  // with no title or snippet would fail the whole search.
  it('answers a missing title or snippet as an empty one', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            title: 'Souq Al Khobar',
            url: 'https://a.example/souq',
            content: null,
            score: 0.81,
          },
          {
            url: 'https://b.example/guide',
            content: 'Where to eat and shop.',
            score: 0.64,
          },
          {
            title: 'Khobar corniche',
            url: 'https://c.example/corniche',
            content: 'A walk by the sea.',
            score: 0.52,
          },
        ],
      })
    );

    expect(await new TavilyService().search('org-1', 'سوق الخبر')).toEqual([
      { title: 'Souq Al Khobar', url: 'https://a.example/souq', snippet: '' },
      {
        title: '',
        url: 'https://b.example/guide',
        snippet: 'Where to eat and shop.',
      },
      {
        title: 'Khobar corniche',
        url: 'https://c.example/corniche',
        snippet: 'A walk by the sea.',
      },
    ]);
  });
});

describe('TavilyService.extract', () => {
  it('asks Tavily to read the addresses at basic depth, as markdown, with the key', async () => {
    fetchSpy.mockResolvedValue(answer(200, { results: [] }));

    await new TavilyService().extract('org-1', [
      'https://a.example/',
      'https://b.example/menu',
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.tavily.com/extract');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer tvly-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      urls: ['https://a.example/', 'https://b.example/menu'],
      extract_depth: 'basic',
      format: 'markdown',
    });
  });

  // Tavily doesn't promise its results come back in the order asked, so they
  // are matched to the addresses by address.
  it('answers one entry per address, in the order asked, whatever order Tavily answers in', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          { url: 'https://c.example/', raw_content: 'Page C' },
          { url: 'https://a.example/', raw_content: 'Page A' },
          { url: 'https://b.example/', raw_content: 'Page B' },
        ],
        failed_results: [],
      })
    );

    expect(
      await new TavilyService().extract('org-1', [
        'https://a.example/',
        'https://b.example/',
        'https://c.example/',
      ])
    ).toEqual([
      { url: 'https://a.example/', text: 'Page A' },
      { url: 'https://b.example/', text: 'Page B' },
      { url: 'https://c.example/', text: 'Page C' },
    ]);
  });

  it("gives a page that failed Tavily's own reason", async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [{ url: 'https://a.example/', raw_content: 'Page A' }],
        failed_results: [
          { url: 'https://b.example/', error: 'Failed to fetch url' },
        ],
      })
    );

    expect(
      await new TavilyService().extract('org-1', [
        'https://b.example/',
        'https://a.example/',
      ])
    ).toEqual([
      { url: 'https://b.example/', error: 'Failed to fetch url' },
      { url: 'https://a.example/', text: 'Page A' },
    ]);
  });

  // Tavily may answer with another form of the address asked, so the two are
  // compared once parsed, and the answer keeps the address as asked.
  it.each([
    [
      'a trailing slash added',
      'https://a.example/menu',
      'https://a.example/menu/',
    ],
    [
      'a trailing slash dropped',
      'https://a.example/menu/',
      'https://a.example/menu',
    ],
    [
      'the host in another case',
      'https://Shop.Example/menu',
      'https://shop.example/menu',
    ],
    [
      'the default port spelled out',
      'https://a.example/menu',
      'https://a.example:443/menu',
    ],
  ])('matches a page Tavily answers with %s', async (_, asked, answered) => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [{ url: answered, raw_content: 'Menu' }],
        failed_results: [],
      })
    );

    expect(await new TavilyService().extract('org-1', [asked])).toEqual([
      { url: asked, text: 'Menu' },
    ]);
  });

  it("gives a page that failed under another form of its address Tavily's own reason", async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [],
        failed_results: [
          { url: 'https://b.example/menu/', error: 'Failed to fetch url' },
        ],
      })
    );

    expect(
      await new TavilyService().extract('org-1', ['https://b.example/menu'])
    ).toEqual([
      { url: 'https://b.example/menu', error: 'Failed to fetch url' },
    ]);
  });

  it('still tells apart two pages whose paths differ', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          { url: 'https://a.example/menu/drinks', raw_content: 'Drinks' },
        ],
        failed_results: [],
      })
    );

    expect(
      await new TavilyService().extract('org-1', [
        'https://a.example/menu',
        'https://a.example/menu/drinks',
      ])
    ).toEqual([
      { url: 'https://a.example/menu', error: UNREADABLE },
      { url: 'https://a.example/menu/drinks', text: 'Drinks' },
    ]);
  });

  it('matches an address that is not a full URL by its text', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [{ url: 'a.example/menu', raw_content: 'Menu' }],
        failed_results: [],
      })
    );

    expect(
      await new TavilyService().extract('org-1', ['a.example/menu'])
    ).toEqual([{ url: 'a.example/menu', text: 'Menu' }]);
  });

  it('says a page returned with no text, or not returned at all, could not be read', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [{ url: 'https://a.example/', raw_content: '' }],
        failed_results: [],
      })
    );

    expect(
      await new TavilyService().extract('org-1', [
        'https://a.example/',
        'https://b.example/',
      ])
    ).toEqual([
      { url: 'https://a.example/', error: UNREADABLE },
      { url: 'https://b.example/', error: UNREADABLE },
    ]);
  });

  // The text is stored in the thread and sent to the model again on every
  // later turn, so a long page would be paid for on each of them.
  it('cuts text over 8,000 characters at 8,000 and says so after a blank line', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content: `${'a'.repeat(8_000)}${'b'.repeat(500)}`,
          },
        ],
      })
    );

    const [page] = await new TavilyService().extract('org-1', [
      'https://a.example/',
    ]);

    expect(page.text).toBe(
      `${'a'.repeat(8_000)}\n\n[Cut at 8,000 characters.]`
    );
  });

  it('leaves text of 8,000 characters or fewer as it is', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          { url: 'https://a.example/', raw_content: 'a'.repeat(8_000) },
          { url: 'https://b.example/', raw_content: '# Menu\n\nKunafa' },
        ],
      })
    );

    expect(
      await new TavilyService().extract('org-1', [
        'https://a.example/',
        'https://b.example/',
      ])
    ).toEqual([
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
  ])('removes %s', async (_, raw_content, text) => {
    fetchSpy.mockResolvedValue(
      answer(200, { results: [{ url: 'https://a.example/', raw_content }] })
    );

    expect(
      await new TavilyService().extract('org-1', ['https://a.example/'])
    ).toEqual([{ url: 'https://a.example/', text }]);
  });

  // Samy follows a page's own links to find the page it needs.
  it('keeps the links in the text', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content:
              '[Menu](https://a.example/menu) | [Contact us](https://a.example/contact)\n\n![Logo](https://a.example/logo.svg)\n\nKunafa',
          },
        ],
      })
    );

    const [page] = await new TavilyService().extract('org-1', [
      'https://a.example/',
    ]);

    expect(page.text).toBe(
      '[Menu](https://a.example/menu) | [Contact us](https://a.example/contact)\n\nKunafa'
    );
  });

  it('cuts at 8,000 characters of words, not counting the images removed', async () => {
    // 100 characters, the blank line after it included.
    const image = `![Flag](https://a.example/${'f'.repeat(67)}.svg)\n\n`;
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content: `${image.repeat(10)}${'a'.repeat(7_500)}`,
          },
        ],
      })
    );

    const [page] = await new TavilyService().extract('org-1', [
      'https://a.example/',
    ]);

    expect(page.text).toBe('a'.repeat(7_500));
  });

  it('says a page with nothing but images could not be read', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content:
              '![Logo](https://a.example/logo.svg)\n\n[![Sale](https://a.example/sale.png)](https://a.example/sale)\n',
          },
        ],
      })
    );

    expect(
      await new TavilyService().extract('org-1', ['https://a.example/'])
    ).toEqual([{ url: 'https://a.example/', error: UNREADABLE }]);
  });

  // Samy's read asks without images, and its answer is what 052 shipped.
  it.each([
    ['no options', undefined],
    ['images off', { images: false }],
  ])(
    'with %s, asks and answers exactly as before, even if Tavily sends image links',
    async (_, options) => {
      fetchSpy.mockResolvedValue(
        answer(200, {
          results: [
            {
              url: 'https://a.example/',
              raw_content: 'Kunafa',
              images: ['https://a.example/logo.svg'],
              favicon: 'https://a.example/favicon.ico',
            },
          ],
          failed_results: [],
        })
      );

      const pages = await new TavilyService().extract(
        'org-1',
        ['https://a.example/'],
        options
      );

      expect(fetchSpy.mock.calls[0][1].body).toBe(
        JSON.stringify({
          urls: ['https://a.example/'],
          extract_depth: 'basic',
          format: 'markdown',
        })
      );
      expect(pages).toStrictEqual([
        { url: 'https://a.example/', text: 'Kunafa' },
      ]);
    }
  );
});

// A brand's "Fill from my website" picks its logo candidates from a page's
// image links, which Samy's read of the page never gives.
describe('TavilyService.extract with images', () => {
  const extractWithImages = (urls: string[]) =>
    new TavilyService().extract('org-1', urls, { images: true });

  it("asks Tavily for the pages' image links and favicons too", async () => {
    fetchSpy.mockResolvedValue(answer(200, { results: [] }));

    await extractWithImages(['https://a.example/']);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      urls: ['https://a.example/'],
      extract_depth: 'basic',
      format: 'markdown',
      include_images: true,
      include_favicon: true,
    });
  });

  it("answers each page's image links and favicon beside its words only", async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://b.example/',
            raw_content: '![Logo](https://b.example/logo.svg)\n\nKunafa',
            images: ['https://b.example/logo.svg'],
            favicon: 'https://b.example/favicon.ico',
          },
          {
            url: 'https://a.example/',
            raw_content:
              '# Souq\n\n![Banner](https://a.example/banner.png)\n\nDates and coffee.',
            images: [
              'https://a.example/brand-logo.png',
              'https://a.example/banner.png',
            ],
            favicon: 'https://a.example/apple-touch-icon.png',
          },
        ],
        failed_results: [],
      })
    );

    expect(
      await extractWithImages(['https://a.example/', 'https://b.example/'])
    ).toStrictEqual([
      {
        url: 'https://a.example/',
        text: '# Souq\n\nDates and coffee.',
        images: [
          'https://a.example/brand-logo.png',
          'https://a.example/banner.png',
        ],
        favicon: 'https://a.example/apple-touch-icon.png',
      },
      {
        url: 'https://b.example/',
        text: 'Kunafa',
        images: ['https://b.example/logo.svg'],
        favicon: 'https://b.example/favicon.ico',
      },
    ]);
  });

  // A logo candidate is fetched later by its address alone, with no page to
  // resolve a relative one against.
  it('keeps only absolute http(s) links, each once, in the order Tavily gave them', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content: 'Kunafa',
            images: [
              'https://a.example/logo.svg',
              '/assets/logo.png',
              'logo-dark.png',
              '//cdn.example/hero.jpg',
              'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
              'ftp://a.example/logo.png',
              'https://cdn.example/hero.jpg',
              'https://a.example/logo.svg',
            ],
            favicon: '/favicon.ico',
          },
        ],
      })
    );

    expect(await extractWithImages(['https://a.example/'])).toStrictEqual([
      {
        url: 'https://a.example/',
        text: 'Kunafa',
        images: ['https://a.example/logo.svg', 'https://cdn.example/hero.jpg'],
      },
    ]);
  });

  it('gives a page with no words its image links, its words unread', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content: '![Logo](https://a.example/logo.svg)\n',
            images: ['https://a.example/logo.svg'],
          },
        ],
      })
    );

    expect(await extractWithImages(['https://a.example/'])).toStrictEqual([
      {
        url: 'https://a.example/',
        error: UNREADABLE,
        images: ['https://a.example/logo.svg'],
      },
    ]);
  });

  it("answers no image links for a page Tavily found none on, or couldn't read", async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [{ url: 'https://a.example/', raw_content: 'Kunafa' }],
        failed_results: [
          { url: 'https://b.example/', error: 'Failed to fetch url' },
        ],
      })
    );

    expect(
      await extractWithImages(['https://a.example/', 'https://b.example/'])
    ).toStrictEqual([
      { url: 'https://a.example/', text: 'Kunafa', images: [] },
      { url: 'https://b.example/', error: 'Failed to fetch url', images: [] },
    ]);
  });
});

describe.each(Object.keys(calls) as (keyof typeof calls)[])(
  'TavilyService %s',
  (kind) => {
    const call = () => calls[kind](new TavilyService());

    it('gives the call 20 seconds', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      fetchSpy.mockResolvedValue(answer(200, { results: [] }));

      await call();

      expect(timeout).toHaveBeenCalledWith(20_000);
      expect(fetchSpy.mock.calls[0][1].signal).toBe(
        timeout.mock.results[0].value
      );
    });

    it.each([
      [432, 402, CREDITS],
      [433, 402, CREDITS],
      [401, 502, REFUSED],
      [400, 502, REFUSED],
      [422, 502, REFUSED],
      [404, 502, REFUSED],
      [434, 502, REFUSED],
      [429, 429, BUSY],
      [500, 503, UNREACHABLE],
      [503, 503, UNREACHABLE],
    ])(
      'turns a %i from Tavily into a %i the model can relay',
      async (tavily, status, message) => {
        fetchSpy.mockResolvedValue(answer(tavily, { detail: 'nope' }));

        const err = await rejection(call());

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(status);
        expect(err.message).toBe(message);
      }
    );

    it('says Tavily could not be reached when the request never gets there', async () => {
      fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

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
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.reject(
            new DOMException('The operation was aborted', 'TimeoutError')
          ),
      });

      const err = await rejection(call());

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(504);
      expect(err.message).toBe(TOO_LONG);
    });
  }
);

// Every organization draws on one monthly Tavily credit pool, watched from
// these lines rather than from Tavily's dashboard.
describe('TavilyService log', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(1_250);
  });

  it('writes one WebLookup line for a search', async () => {
    fetchSpy.mockResolvedValue(answer(200, { results: [] }));

    await new TavilyService().search('org-1', 'سوق الخبر');

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'search', ok: true, ms: 250 },
        context: 'WebLookup',
      },
    ]);
  });

  // Tavily bills the pages it read, so the line counts those, and the call
  // still counts as answered when some pages failed.
  it('writes one WebLookup line for a read, with the pages read', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          { url: 'https://a.example/', raw_content: 'Page A' },
          { url: 'https://b.example/', raw_content: 'Page B' },
          { url: 'https://d.example/', raw_content: '' },
        ],
        failed_results: [
          { url: 'https://c.example/', error: 'Failed to fetch url' },
        ],
      })
    );

    await new TavilyService().extract('org-1', [
      'https://a.example/',
      'https://b.example/',
      'https://c.example/',
      'https://d.example/',
    ]);

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'extract', ok: true, ms: 250, pages: 2 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes the same line for a read with images, counting the pages with words', async () => {
    fetchSpy.mockResolvedValue(
      answer(200, {
        results: [
          {
            url: 'https://a.example/',
            raw_content: 'Page A',
            images: ['https://a.example/logo.svg'],
          },
          {
            url: 'https://b.example/',
            raw_content: '![Logo](https://b.example/logo.svg)',
            images: ['https://b.example/logo.svg'],
          },
        ],
      })
    );

    await new TavilyService().extract(
      'org-1',
      ['https://a.example/', 'https://b.example/'],
      { images: true }
    );

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'extract', ok: true, ms: 250, pages: 1 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes one line for a failed search', async () => {
    fetchSpy.mockResolvedValue(answer(432));

    await rejection(new TavilyService().search('org-1', 'سوق الخبر'));

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'search', ok: false, ms: 250 },
        context: 'WebLookup',
      },
    ]);
  });

  it('writes one line for a failed read, with no pages read', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    await rejection(
      new TavilyService().extract('org-1', ['https://a.example/'])
    );

    expect(logged).toEqual([
      {
        line: { org: 'org-1', kind: 'extract', ok: false, ms: 250, pages: 0 },
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

    it('still answers a search', async () => {
      fetchSpy.mockResolvedValue(
        answer(200, {
          results: [
            { title: 'Souq', url: 'https://a.example/', content: 'Market' },
          ],
        })
      );

      expect(await new TavilyService().search('org-1', 'سوق الخبر')).toEqual([
        { title: 'Souq', url: 'https://a.example/', snippet: 'Market' },
      ]);
    });

    it('still answers a read', async () => {
      fetchSpy.mockResolvedValue(
        answer(200, {
          results: [{ url: 'https://a.example/', raw_content: 'Page A' }],
        })
      );

      expect(
        await new TavilyService().extract('org-1', ['https://a.example/'])
      ).toEqual([{ url: 'https://a.example/', text: 'Page A' }]);
    });

    it("still fails with Tavily's reason, not the logger's", async () => {
      fetchSpy.mockResolvedValue(answer(429));

      const err = await rejection(
        new TavilyService().search('org-1', 'سوق الخبر')
      );

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(err.message).toBe(BUSY);
    });
  });
});
