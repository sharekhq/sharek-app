// MediaService and BrandService drag in Prisma, storage and provider SDKs at
// import; none of that code runs here, so both are empty shells and each test
// hands the service the doubles it calls (as media.service.spec does).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
);
// An image's bytes come from the site; each test says what a link holds.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch',
  () => ({ readOrFetch: jest.fn() })
);

import { BadRequestException, HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { BrandWebsiteService } from './brand.website.service';
import { readOrFetch } from '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch';
import type { Brand } from './brand.service';

const read = readOrFetch as jest.Mock;

type Pixel = [number, number, number, number?];

// A real PNG, painted pixel by pixel: the colours are sharp's real decode of
// it, which a double would only restate.
const png = (
  width: number,
  height: number,
  paint: (x: number, y: number) => Pixel
) => {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      pixels.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
};

const WHITE: Pixel = [255, 255, 255];
const BLACK: Pixel = [0, 0, 0];
const CLEAR: Pixel = [0, 0, 0, 0];
const RED: Pixel = [0xe3, 0x06, 0x13];
const NAVY: Pixel = [0x1f, 0x3a, 0x5f];

// A 40×40 mark: `colour` inside the 20×20 square at its centre, `around`
// everywhere else.
const mark = (colour: Pixel, around: Pixel) =>
  png(40, 40, (x, y) =>
    x >= 10 && x < 30 && y >= 10 && y < 30 ? colour : around
  );

// An ICO holding a PNG: browsers show it, sharp has no reader for it.
const ico = () => {
  const bytes = Buffer.alloc(22 + 8);
  bytes.writeUInt16LE(1, 2);
  bytes.writeUInt16LE(1, 4);
  bytes.writeUInt8(16, 6);
  bytes.writeUInt8(16, 7);
  bytes.writeUInt32LE(8, 14);
  bytes.writeUInt32LE(22, 18);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 22);
  return bytes;
};

const rawda: Brand = {
  id: 'brand-1',
  name: 'Rawda',
  kit: {
    logo: null,
    examples: [],
    colours: ['#B5542C', '#1F3A5F'],
    headingFont: null,
    bodyFont: null,
  },
};

const makeService = () => {
  const tavily = { extract: jest.fn() };
  const media = {
    uploadFromUrl: jest
      .fn()
      .mockResolvedValue({ id: 'media-9', path: 'https://uploads/logo.png' }),
  };
  const brands = {
    list: jest.fn().mockResolvedValue([rawda]),
    saveKit: jest.fn().mockResolvedValue({ ...rawda, id: 'saved' }),
  };
  const service = new BrandWebsiteService(
    tavily as any,
    media as any,
    brands as any
  );

  return { service, tavily, media, brands };
};

// The refusal, or undefined when the call went through
const failure = (pending: Promise<unknown>) =>
  pending.then(
    () => undefined,
    (err: unknown) => err as HttpException
  );

// What each link holds; a link with nothing is one the site doesn't serve.
let site: Record<string, Buffer> = {};

beforeEach(() => {
  site = {};
  read.mockReset().mockImplementation(async (link: string) => {
    if (!site[link]) {
      throw new Error('Request failed with status code 404');
    }
    return site[link];
  });
});

describe('BrandWebsiteService.coloursFromLogo', () => {
  it('reads the image at the link through readOrFetch, bounded by the size the Media library takes for an image, each request waiting at most 5 s', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await mark(RED, CLEAR);

    await service.coloursFromLogo('https://cdn.example/logo.png');

    expect(read).toHaveBeenCalledWith(
      'https://cdn.example/logo.png',
      10 * 1024 * 1024,
      5_000
    );
  });

  it('gives the colour of the mark and leaves out its transparent pixels', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await mark(RED, CLEAR);

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#E30613']);
  });

  it('leaves out a white background, the colour most of the edge is', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await mark(NAVY, WHITE);

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#1F3A5F']);
  });

  it('leaves out a black background and keeps a white mark on it', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await mark(WHITE, BLACK);

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#FFFFFF']);
  });

  it('keeps black and white when they are the mark: a black logo on white, or on nothing', async () => {
    const { service } = makeService();
    site['https://cdn.example/on-white.png'] = await mark(BLACK, WHITE);
    site['https://cdn.example/on-nothing.png'] = await mark(BLACK, CLEAR);

    expect(
      await service.coloursFromLogo('https://cdn.example/on-white.png')
    ).toEqual(['#000000']);
    expect(
      await service.coloursFromLogo('https://cdn.example/on-nothing.png')
    ).toEqual(['#000000']);
  });

  it('keeps a background that is a colour, beside the mark on it', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await mark(WHITE, RED);

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#E30613', '#FFFFFF']);
  });

  it('orders the colours by how much of the logo each covers, and gives at most 6', async () => {
    const { service } = makeService();
    // Eight upright bands, the widest first: 15, 13, 11, 9, 7, 5, 3 and 1
    // pixels out of 64. The seventh is left out by the 6, the eighth also by
    // being under 1 in 50.
    const bands: [number, Pixel][] = [
      [15, [0xe3, 0x06, 0x13]],
      [13, [0x1f, 0x3a, 0x5f]],
      [11, [0x2e, 0x9e, 0x44]],
      [9, [0xf2, 0xb7, 0x05]],
      [7, [0x7a, 0x3e, 0x9d]],
      [5, [0x00, 0xa3, 0xc4]],
      [3, [0x8b, 0x5a, 0x2b]],
      [1, [0xff, 0x6f, 0x00]],
    ];
    site['https://cdn.example/logo.png'] = await png(64, 10, (x) => {
      let start = 0;
      for (const [width, colour] of bands) {
        if (x < start + width) {
          return colour;
        }
        start += width;
      }
      return CLEAR;
    });

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual([
      '#E30613',
      '#1F3A5F',
      '#2E9E44',
      '#F2B705',
      '#7A3E9D',
      '#00A3C4',
    ]);
  });

  it('leaves out a colour on under 1 in 50 of the coloured pixels, such as the blend along an edge', async () => {
    const { service } = makeService();
    // 396 red pixels and 4 navy ones.
    site['https://cdn.example/logo.png'] = await png(40, 40, (x, y) => {
      if (x >= 10 && x < 30 && y >= 10 && y < 30) {
        return x < 12 && y < 12 ? NAVY : RED;
      }
      return CLEAR;
    });

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#E30613']);
  });

  it('gives two shades a few values apart as one colour, the one covering more', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.png'] = await png(40, 10, (x) =>
      x < 25 ? [0xe1, 0x06, 0x13] : [0xdf, 0x06, 0x13]
    );

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.png')
    ).toEqual(['#E10613']);
  });

  it('reads an SVG logo', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.svg'] = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#fff"/><rect x="10" y="10" width="20" height="20" fill="#1F3A5F"/></svg>'
    );

    expect(
      await service.coloursFromLogo('https://cdn.example/logo.svg')
    ).toEqual(['#1F3A5F']);
  });

  it('gives no colours for a logo that is all background', async () => {
    const { service } = makeService();
    site['https://cdn.example/blank.png'] = await png(20, 20, () => WHITE);

    expect(
      await service.coloursFromLogo('https://cdn.example/blank.png')
    ).toEqual([]);
  });

  it.each([
    [
      'an ICO, which sharp has no reader for',
      'https://cdn.example/favicon.ico',
    ],
    ['a link the site does not serve', 'https://cdn.example/gone.png'],
    ['bytes that are no image', 'https://cdn.example/page.html'],
  ])(
    "refuses %s with a 422 the card words as the image couldn't be read",
    async (_, link) => {
      const { service } = makeService();
      site['https://cdn.example/favicon.ico'] = ico();
      site['https://cdn.example/page.html'] = Buffer.from('<!doctype html>');

      const err = await failure(service.coloursFromLogo(link));

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This image couldn't be read.");
    }
  );
});

describe('BrandWebsiteService.suggestFromWebsite', () => {
  const page = (fields: object) => [
    { url: 'https://www.noordental.example/', text: 'Noor Dental', ...fields },
  ];

  it('asks Tavily for the one address, with its image links and favicon', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(page({ images: [] }));

    await service.suggestFromWebsite(
      'org-1',
      'https://www.noordental.example/'
    );

    expect(tavily.extract).toHaveBeenCalledTimes(1);
    expect(tavily.extract).toHaveBeenCalledWith(
      'org-1',
      ['https://www.noordental.example/'],
      { images: true }
    );
  });

  it('puts the links whose path names a logo first, then the rest in Tavily’s order, then the favicon, and gives the colours of the first', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(
      page({
        images: [
          'https://cdn.example/hero.jpg',
          'https://cdn.example/img/Logo-White.png',
          'https://cdn.example/team.jpg',
          'https://cdn.example/brand/site-logo.svg',
        ],
        favicon: 'https://www.noordental.example/favicon.png',
      })
    );
    site['https://cdn.example/img/Logo-White.png'] = await mark(RED, CLEAR);

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({
      foundOn: 'www.noordental.example',
      logos: [
        'https://cdn.example/img/Logo-White.png',
        'https://cdn.example/brand/site-logo.svg',
        'https://cdn.example/hero.jpg',
        'https://cdn.example/team.jpg',
        'https://www.noordental.example/favicon.png',
      ],
      colours: ['#E30613'],
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('counts "logo" in the path only, not in the host or the query', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(
      page({
        images: [
          'https://logo.cdn.example/hero.jpg',
          'https://cdn.example/pic.jpg?name=logo',
          'https://cdn.example/LOGOS/mark.png',
        ],
      })
    );
    site['https://cdn.example/LOGOS/mark.png'] = await mark(RED, CLEAR);

    const { logos } = await service.suggestFromWebsite(
      'org-1',
      'https://www.noordental.example/'
    );

    expect(logos).toEqual([
      'https://cdn.example/LOGOS/mark.png',
      'https://logo.cdn.example/hero.jpg',
      'https://cdn.example/pic.jpg?name=logo',
    ]);
  });

  it('gives at most 6 links, the favicon once when it is also one of the images', async () => {
    const { service, tavily } = makeService();
    const images = [1, 2, 3, 4, 5, 6, 7].map(
      (n) => `https://cdn.example/photo-${n}.jpg`
    );
    tavily.extract.mockResolvedValue(
      page({ images, favicon: 'https://cdn.example/photo-7.jpg' })
    );
    tavily.extract.mockResolvedValueOnce(
      page({
        images: ['https://cdn.example/mark.png'],
        favicon: 'https://cdn.example/mark.png',
      })
    );
    site['https://cdn.example/mark.png'] = await mark(RED, CLEAR);
    site['https://cdn.example/photo-1.jpg'] = await mark(RED, CLEAR);

    expect(
      (
        await service.suggestFromWebsite(
          'org-1',
          'https://www.noordental.example/'
        )
      ).logos
    ).toEqual(['https://cdn.example/mark.png']);
    expect(
      (
        await service.suggestFromWebsite(
          'org-1',
          'https://www.noordental.example/'
        )
      ).logos
    ).toEqual(images.slice(0, 6));
  });

  it("leaves out a link whose image can't be read and takes the colours of the next, so the first logo is always the one the colours are from", async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(
      page({
        images: ['https://cdn.example/logo-gone.png'],
        favicon: 'https://www.noordental.example/favicon.ico',
      })
    );
    tavily.extract.mockResolvedValueOnce(
      page({
        images: [
          'https://cdn.example/logo-gone.png',
          'https://cdn.example/photo.jpg',
          'https://cdn.example/mark.png',
        ],
      })
    );
    site['https://cdn.example/photo.jpg'] = await mark(NAVY, WHITE);
    site['https://cdn.example/mark.png'] = await mark(RED, CLEAR);
    site['https://www.noordental.example/favicon.ico'] = ico();

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({
      foundOn: 'www.noordental.example',
      logos: ['https://cdn.example/photo.jpg', 'https://cdn.example/mark.png'],
      colours: ['#1F3A5F'],
    });
    // Nothing readable is left: the card says nothing was found
    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({ foundOn: 'www.noordental.example', logos: [], colours: [] });
  });

  // Each of a read's two requests waits at most 5 s, so the 3 reads end within
  // 30 s beside Tavily's 20 s, well inside nginx's 95 s.
  it('counts a link whose read ran out of time as one that can’t be read', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(
      page({
        images: [
          'https://cdn.example/slow-logo.png',
          'https://cdn.example/mark.png',
        ],
      })
    );
    site['https://cdn.example/mark.png'] = await mark(RED, CLEAR);
    read.mockImplementationOnce(async () => {
      // How axios rejects a request its signal aborted
      throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
    });

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({
      foundOn: 'www.noordental.example',
      logos: ['https://cdn.example/mark.png'],
      colours: ['#E30613'],
    });
    expect(read).toHaveBeenNthCalledWith(
      1,
      'https://cdn.example/slow-logo.png',
      10 * 1024 * 1024,
      5_000
    );
  });

  it('reads at most 3 links for the colours: past them, the links stay and there are no colours', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(
      page({
        images: [1, 2, 3, 4, 5].map((n) => `https://cdn.example/gone-${n}.png`),
      })
    );
    site['https://cdn.example/gone-4.png'] = await mark(RED, CLEAR);

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({
      foundOn: 'www.noordental.example',
      logos: [
        'https://cdn.example/gone-4.png',
        'https://cdn.example/gone-5.png',
      ],
      colours: [],
    });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('suggests from the links of a page with no words', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue([
      {
        url: 'https://www.noordental.example/',
        error: "This page couldn't be read.",
        images: ['https://cdn.example/logo.png'],
      },
    ]);
    site['https://cdn.example/logo.png'] = await mark(RED, CLEAR);

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({
      foundOn: 'www.noordental.example',
      logos: ['https://cdn.example/logo.png'],
      colours: ['#E30613'],
    });
  });

  it('answers nothing found, not an error, for a page read with no images', async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue(page({ images: [] }));

    expect(
      await service.suggestFromWebsite(
        'org-1',
        'https://www.noordental.example/'
      )
    ).toEqual({ foundOn: 'www.noordental.example', logos: [], colours: [] });
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a page Tavily couldn't read and has no links for with a 422 the card words as the site couldn't be read", async () => {
    const { service, tavily } = makeService();
    tavily.extract.mockResolvedValue([
      {
        url: 'https://www.noordental.example/',
        error: 'Failed to fetch url',
        images: [],
      },
    ]);

    const err = await failure(
      service.suggestFromWebsite('org-1', 'https://www.noordental.example/')
    );

    expect(err?.getStatus()).toBe(422);
    expect(err?.message).toBe("This site couldn't be read.");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['out of credits', 402],
    ['busy', 429],
    ['unreachable', 503],
    ['too slow', 504],
    ['refusing the request', 502],
  ])(
    'refuses with the same 422 when the web lookup service is %s, its words for Samy left out',
    async (_, status) => {
      const { service, tavily } = makeService();
      tavily.extract.mockRejectedValue(
        new HttpException(
          'Say the lookup failed and offer to try again.',
          status
        )
      );

      const err = await failure(
        service.suggestFromWebsite('org-1', 'https://www.noordental.example/')
      );

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This site couldn't be read.");
    }
  );
});

describe('BrandWebsiteService.saveFromWebsite', () => {
  it('saves the logo to the Media library from its link and puts it in the kit with the colours, answering the saved brand', async () => {
    const { service, media, brands } = makeService();

    const saved = await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo.png',
      colours: ['#E30613'],
    });

    expect(media.uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://cdn.example/logo.png'
    );
    expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
      logoId: 'media-9',
      colours: ['#B5542C', '#1F3A5F', '#E30613'],
    });
    expect(saved).toEqual({ ...rawda, id: 'saved' });
  });

  it('adds the kept colours after the kit’s, in capitals and each once', async () => {
    const { service, brands } = makeService();

    await service.saveFromWebsite('org-1', 'brand-1', {
      colours: ['#1f3a5f', '#e30613', '#E30613', '#2E9E44'],
    });

    expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
      colours: ['#B5542C', '#1F3A5F', '#E30613', '#2E9E44'],
    });
  });

  it('keeps the kit to 6 colours, the kit’s own first', async () => {
    const { service, brands } = makeService();
    brands.list.mockResolvedValue([
      {
        ...rawda,
        kit: {
          ...rawda.kit,
          colours: ['#111111', '#222222', '#333333', '#444444', '#555555'],
        },
      },
    ]);

    await service.saveFromWebsite('org-1', 'brand-1', {
      colours: ['#E30613', '#2E9E44', '#1F3A5F'],
    });

    expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
      colours: [
        '#111111',
        '#222222',
        '#333333',
        '#444444',
        '#555555',
        '#E30613',
      ],
    });
  });

  it('saves nothing to Media without a logo, and leaves the kit’s logo as it is', async () => {
    const { service, media, brands } = makeService();

    await service.saveFromWebsite('org-1', 'brand-1', { colours: [] });

    expect(media.uploadFromUrl).not.toHaveBeenCalled();
    expect(brands.saveKit.mock.calls[0][2]).not.toHaveProperty('logoId');
  });

  it.each([
    ['the site refuses the link', 'Failed to fetch URL'],
    ['it is a file the Media library does not take', 'Unsupported file type.'],
    ['it is too large', 'File is too large.'],
  ])(
    "refuses a logo that can't be fetched (%s) with a 422 and saves nothing",
    async (_, reason) => {
      const { service, media, brands } = makeService();
      media.uploadFromUrl.mockRejectedValue(new BadRequestException(reason));

      const err = await failure(
        service.saveFromWebsite('org-1', 'brand-1', {
          logo: 'https://cdn.example/logo.svg',
          colours: ['#E30613'],
        })
      );

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This logo couldn't be saved.");
      expect(brands.saveKit).not.toHaveBeenCalled();
    }
  );

  it('refuses a brand that is not a live brand of the organization with a 404, before anything is saved', async () => {
    const { service, media, brands } = makeService();
    brands.list.mockResolvedValue([{ ...rawda, id: 'brand-2' }]);

    const err = await failure(
      service.saveFromWebsite('org-1', 'brand-1', {
        logo: 'https://cdn.example/logo.png',
        colours: ['#E30613'],
      })
    );

    expect(brands.list).toHaveBeenCalledWith('org-1');
    expect(err?.getStatus()).toBe(404);
    expect(err?.message).toBe('Brand not found');
    expect(media.uploadFromUrl).not.toHaveBeenCalled();
    expect(brands.saveKit).not.toHaveBeenCalled();
  });
});
