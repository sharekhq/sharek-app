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

import { HttpException, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { BrandWebsiteService } from './brand.website.service';
import {
  FirecrawlService,
  SiteBranding,
} from '@gitroom/nestjs-libraries/firecrawl/firecrawl.service';
import { readOrFetch } from '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch';
import type { Brand } from './brand.service';

const read = readOrFetch as jest.Mock;

type Pixel = [number, number, number, number?];

// A real PNG, painted pixel by pixel: its size and its pixels are sharp's real
// decode of it, which a double would only restate.
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
const CLEAR: Pixel = [0, 0, 0, 0];
const RED: Pixel = [0xe3, 0x06, 0x13];
const NAVY: Pixel = [0x1f, 0x3a, 0x5f];

// A 40×40 mark: `colour` inside the 20×20 square at its centre, `around`
// everywhere else.
const mark = (colour: Pixel, around: Pixel) =>
  png(40, 40, (x, y) =>
    x >= 10 && x < 30 && y >= 10 && y < 30 ? colour : around
  );

// A navy PNG of a size, square unless a height is given, as a site's icon is.
const navy = (width: number, height = width) => png(width, height, () => NAVY);

// A 40×40 SVG with a red square in its corner.
const SQUARE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="20" height="20" fill="#E30613"/></svg>';

// A GIF of two 40×40 frames, the first red and the second navy.
const twoFrameGif = () => {
  const pixels = Buffer.alloc(40 * 80 * 4);
  for (let i = 0; i < 40 * 80; i++) {
    pixels.set([...(i < 40 * 40 ? RED : NAVY), 255], i * 4);
  }
  return sharp(pixels, {
    raw: { width: 40, height: 80, channels: 4, pageHeight: 40 },
  })
    .gif()
    .toBuffer();
};

// The first box of an MP4, the one every video file opens with.
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 2, 0]),
  Buffer.from('isomiso2'),
]);

// An image's pixels as sharp decodes them, its first frame for an animation.
const pixelsOf = (image: Buffer) => sharp(image).ensureAlpha().raw().toBuffer();

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
  const firecrawl = { branding: jest.fn() };
  const media = {
    saveImage: jest
      .fn()
      .mockResolvedValue({ id: 'media-10', path: 'https://uploads/logo.png' }),
  };
  const brands = {
    get: jest.fn().mockResolvedValue(rawda),
    saveKit: jest.fn().mockResolvedValue({ ...rawda, id: 'saved' }),
  };
  const service = new BrandWebsiteService(
    firecrawl as any,
    media as any,
    brands as any
  );

  return { service, firecrawl, media, brands };
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

describe('BrandWebsiteService.suggestFromWebsite', () => {
  const LOGO = 'https://cdn.noordental.example/brand/logo.png';
  const ICON = 'https://www.noordental.example/apple-touch-icon.png';
  const NOTHING = {
    foundOn: 'www.noordental.example',
    logos: [],
    colours: [],
  };

  // What the lookup answers of a site: the address it led to, and the parts a
  // test names. A value is unknown because Firecrawl's answer is handed on as
  // it came, so a colour or a font might not be text.
  const branding = (
    parts: Partial<Record<keyof SiteBranding, unknown>> = {}
  ) => ({
    url: 'https://www.noordental.example/',
    colours: [],
    ...parts,
  });

  const suggest = (service: BrandWebsiteService) =>
    service.suggestFromWebsite('org-1', 'https://www.noordental.example/');

  it('asks Firecrawl once for the branding of the one address, for the organization', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding());

    await suggest(service);

    expect(firecrawl.branding).toHaveBeenCalledTimes(1);
    expect(firecrawl.branding).toHaveBeenCalledWith(
      'org-1',
      'https://www.noordental.example/'
    );
  });

  it('suggests the logo, the colours and the two fonts the site gave', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({
        logo: LOGO,
        colours: ['#1F3A5F', '#E30613', '#2E9E44'],
        headingFont: 'Tajawal',
        bodyFont: 'IBM Plex Sans Arabic',
      })
    );
    site[LOGO] = await mark(RED, CLEAR);

    expect(await suggest(service)).toEqual({
      foundOn: 'www.noordental.example',
      logos: [LOGO],
      colours: ['#1F3A5F', '#E30613', '#2E9E44'],
      headingFont: 'Tajawal',
      bodyFont: 'IBM Plex Sans Arabic',
    });
  });

  // A bare address is asked on https://, and a home page that redirects is
  // followed, so the card names where the suggestions really came from.
  it('names the host the site led to, not the one asked: kaust.edu.sa that led to www.kaust.edu.sa/en/ is found on www.kaust.edu.sa', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ url: 'https://www.kaust.edu.sa/en/' })
    );

    const { foundOn } = await service.suggestFromWebsite(
      'org-1',
      'https://kaust.edu.sa'
    );

    expect(foundOn).toBe('www.kaust.edu.sa');
  });

  it('answers nothing found, not an error, for a site that gave no logo, colour or font, and reads nothing', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding());

    expect(await suggest(service)).toEqual(NOTHING);
    expect(read).not.toHaveBeenCalled();
  });

  it('offers the logo first, then the icon when it is another link and big enough, each read through readOrFetch, bounded by the size the Media library takes for an image, each request waiting at most 5 s', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[LOGO] = await mark(RED, CLEAR);
    site[ICON] = await navy(192);

    expect((await suggest(service)).logos).toEqual([LOGO, ICON]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith(LOGO, 10 * 1024 * 1024, 5_000);
    expect(read).toHaveBeenCalledWith(ICON, 10 * 1024 * 1024, 5_000);
  });

  // The kit's logo is the reference the image model copies, so a browser tab's
  // icon, 64 pixels or smaller, gives it too little; a touch icon is 180 or
  // 192.
  it('a 32-pixel icon is not offered: it is too small to work as a logo', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[LOGO] = await mark(RED, CLEAR);
    site[ICON] = await navy(32);

    expect((await suggest(service)).logos).toEqual([LOGO]);
  });

  it.each([
    ['128×128, the least', 128, 128],
    ['180×180, a touch icon', 180, 180],
    ['300×128, measured on its short side', 300, 128],
  ])('offers an icon of %s', async (_, width, height) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[LOGO] = await mark(RED, CLEAR);
    site[ICON] = await navy(width, height);

    expect((await suggest(service)).logos).toEqual([LOGO, ICON]);
  });

  it.each([
    ['127×127, a pixel short', 127, 127],
    ['64×64, a browser tab’s', 64, 64],
    ['512×100, large on its long side only', 512, 100],
  ])('does not offer an icon of %s', async (_, width, height) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[LOGO] = await mark(RED, CLEAR);
    site[ICON] = await navy(width, height);

    expect((await suggest(service)).logos).toEqual([LOGO]);
  });

  it('offers an SVG icon whatever its size, since it is drawn at any', async () => {
    const { service, firecrawl } = makeService();
    const icon = 'https://www.noordental.example/favicon.svg';
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon }));
    site[LOGO] = await mark(RED, CLEAR);
    // 40×40 as written
    site[icon] = Buffer.from(SQUARE_SVG);

    expect((await suggest(service)).logos).toEqual([LOGO, icon]);
  });

  it('does not offer an ICO icon, which sharp can’t read and the kit couldn’t save', async () => {
    const { service, firecrawl } = makeService();
    const icon = 'https://www.noordental.example/favicon.ico';
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon }));
    site[LOGO] = await mark(RED, CLEAR);
    site[icon] = ico();

    expect((await suggest(service)).logos).toEqual([LOGO]);
  });

  it('offers a link once when the icon is the logo’s own, and reads it once', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: LOGO }));
    site[LOGO] = await navy(192);

    expect((await suggest(service)).logos).toEqual([LOGO]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('offers the logo whatever its size: only the icon has to be big enough', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO }));
    site[LOGO] = await navy(32);

    expect((await suggest(service)).logos).toEqual([LOGO]);
  });

  // Only an image the kit could save is offered: Add to kit reads the link
  // again and puts it through sharp.
  it.each([
    ['the site does not serve', 'https://cdn.example/gone.png'],
    ['is a page', 'https://cdn.example/about'],
    ['is a video', 'https://cdn.example/intro.mp4'],
    ['is an ICO (sharp can’t read one)', 'https://cdn.example/x.ico'],
  ])('does not offer a logo that %s', async (_, logo) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo }));
    site['https://cdn.example/about'] = Buffer.from('<!doctype html>');
    site['https://cdn.example/intro.mp4'] = MP4;
    site['https://cdn.example/x.ico'] = ico();

    expect(await suggest(service)).toEqual(NOTHING);
    expect(read).toHaveBeenCalledWith(logo, 10 * 1024 * 1024, 5_000);
  });

  it.each([
    ['the lookup names no logo', {}],
    ['the logo can’t be read', { logo: LOGO }],
  ])('offers a big enough icon alone when %s', async (_, logo) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ ...logo, icon: ICON }));
    site[ICON] = await navy(192);

    expect((await suggest(service)).logos).toEqual([ICON]);
  });

  it('offers no logo when the lookup names none and the icon is too small', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ icon: ICON, colours: ['#1F3A5F'] })
    );
    site[ICON] = await navy(32);

    expect(await suggest(service)).toEqual({
      ...NOTHING,
      colours: ['#1F3A5F'],
    });
  });

  // Each of a read's two requests waits at most 5 s, and the two links are
  // read at once, so the reads end within 10 s beside Firecrawl's 30 s, well
  // inside nginx's 95 s.
  it('counts a logo whose read ran out of time as one that can’t be read, and still offers the icon', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[ICON] = await navy(192);
    read.mockImplementation(async (link: string) => {
      if (link === LOGO) {
        // How axios rejects a request its signal aborted
        throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
      }
      return site[link];
    });

    expect((await suggest(service)).logos).toEqual([ICON]);
  });

  it('reads the logo and the icon at once, not one after the other', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, icon: ICON }));
    site[LOGO] = await mark(RED, CLEAR);
    site[ICON] = await navy(192);
    let reading = 0;
    let most = 0;
    read.mockImplementation(async (link: string) => {
      reading++;
      most = Math.max(most, reading);
      await new Promise((resolve) => setTimeout(resolve, 10));
      reading--;
      return site[link];
    });

    await suggest(service);

    expect(most).toBe(2);
  });

  it('offers the primary, secondary and accent colours in that order, in capitals', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ colours: ['#1f3a5f', '#E30613', '#2e9e44'] })
    );

    expect((await suggest(service)).colours).toEqual([
      '#1F3A5F',
      '#E30613',
      '#2E9E44',
    ]);
  });

  it.each([
    ['a 3-digit code', '#FFF'],
    ['a code with an alpha', '#0057B8FF'],
    ['an rgb() colour', 'rgb(0, 87, 184)'],
    ['a named colour', 'blue'],
    ['a code without its #', '0057B8'],
    ['a number', 0x0057b8],
    ['an object', { hex: '#0057B8' }],
  ])(
    'drops %s, which is not #RRGGBB, and keeps the others in their order',
    async (_, colour) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockResolvedValue(
        branding({ colours: ['#1F3A5F', colour, '#2E9E44'] })
      );

      expect((await suggest(service)).colours).toEqual(['#1F3A5F', '#2E9E44']);
    }
  );

  // Camel Step's primary and accent are the same blue.
  it('offers a code given twice once, whatever its case, at its first place', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ colours: ['#0057b8', '#E30613', '#0057B8'] })
    );

    expect((await suggest(service)).colours).toEqual(['#0057B8', '#E30613']);
  });

  it.each([
    ['a red logo adds no red to the site’s navy', ['#1F3A5F']],
    ['a site with a logo and no colours has none to offer', []],
  ])(
    'takes the colours from the lookup, never from an image: %s',
    async (_, colours) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockResolvedValue(branding({ logo: LOGO, colours }));
      site[LOGO] = await mark(RED, CLEAR);

      expect(await suggest(service)).toEqual({
        ...NOTHING,
        logos: [LOGO],
        colours,
      });
    }
  );

  it('offers the headings and the body font by the plain names the site gave', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ headingFont: 'Tajawal', bodyFont: 'IBM Plex Sans Arabic' })
    );

    expect(await suggest(service)).toEqual({
      ...NOTHING,
      headingFont: 'Tajawal',
      bodyFont: 'IBM Plex Sans Arabic',
    });
  });

  // What sharek.app answered: the name a build gives a font it serves.
  it('offers "IBM Plex Sans-fea3ea334779485b" as "IBM Plex Sans", its build suffix removed', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({
        headingFont: 'IBM Plex Sans-fea3ea334779485b',
        bodyFont: 'IBM Plex Sans-0260e4c03722b477',
      })
    );

    expect(await suggest(service)).toEqual({
      ...NOTHING,
      headingFont: 'IBM Plex Sans',
      bodyFont: 'IBM Plex Sans',
    });
  });

  // A build's suffix is a hyphen and 8 or more hex characters at the name's
  // end; any other hyphen is the name's own.
  it.each([
    ['PingFang-SC'],
    ['Avenir-Next'],
    ['Noor-1a2b3c4'],
    ['Noor-1a2b3c4d Display'],
  ])('keeps the hyphen of %j, which is no build suffix', async (font) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ headingFont: font, bodyFont: font })
    );

    expect(await suggest(service)).toEqual({
      ...NOTHING,
      headingFont: font,
      bodyFont: font,
    });
  });

  it.each([
    ['"Noto Kufi Arabic"', 'Noto Kufi Arabic'],
    ["'Cairo'", 'Cairo'],
    ['  Tajawal  ', 'Tajawal'],
    [' "IBM Plex Sans-fea3ea334779485b" ', 'IBM Plex Sans'],
  ])(
    'offers %j as %j, its quotes and outer spaces gone',
    async (font, plain) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockResolvedValue(
        branding({ headingFont: font, bodyFont: font })
      );

      expect(await suggest(service)).toEqual({
        ...NOTHING,
        headingFont: plain,
        bodyFont: plain,
      });
    }
  );

  // Every answer seen so far was a single name. A CSS font stack, were one
  // answered, names the font the site chose first and its fallbacks after it.
  it.each([
    ['"Tajawal", sans-serif', 'Tajawal'],
    ['Cairo, sans-serif', 'Cairo'],
    ["'IBM Plex Sans-fea3ea334779485b', Arial", 'IBM Plex Sans'],
  ])(
    'offers the font stack %j as %j, its first family, plain as any name is',
    async (font, plain) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockResolvedValue(
        branding({ headingFont: font, bodyFont: font })
      );

      expect(await suggest(service)).toEqual({
        ...NOTHING,
        headingFont: plain,
        bodyFont: plain,
      });
    }
  );

  it.each([['system-ui, -apple-system, sans-serif'], ['sans-serif, Arial']])(
    'leaves out the font stack %j, whose first family is generic',
    async (font) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockResolvedValue(
        branding({ headingFont: font, bodyFont: font })
      );

      const suggestions = await suggest(service);

      expect(suggestions.headingFont).toBeUndefined();
      expect(suggestions.bodyFont).toBeUndefined();
    }
  );

  // A generic family or a system's own font is no font a brand chose.
  it.each([
    ['serif'],
    ['sans-serif'],
    ['monospace'],
    ['cursive'],
    ['fantasy'],
    ['system-ui'],
    ['ui-serif'],
    ['ui-sans-serif'],
    ['ui-monospace'],
    ['ui-rounded'],
    ['-apple-system'],
    ['BlinkMacSystemFont'],
    ['inherit'],
    ['initial'],
    // Whatever its case, quotes or spaces
    ['Sans-Serif'],
    ['"sans-serif"'],
    [' SYSTEM-UI '],
    ['blinkmacsystemfont'],
  ])('leaves out the generic family %j', async (font) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ headingFont: font, bodyFont: font })
    );

    const suggestions = await suggest(service);

    expect(suggestions.headingFont).toBeUndefined();
    expect(suggestions.bodyFont).toBeUndefined();
  });

  it.each([
    ['an empty name', ''],
    ['a name of spaces', '   '],
    ['a name of quotes alone', '""'],
    ['a name over 60 characters, more than a kit takes', 'A'.repeat(61)],
    ['a number', 42],
    ['a list of names', ['Tajawal']],
  ])('leaves out %s', async (_, font) => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ headingFont: font, bodyFont: font })
    );

    const suggestions = await suggest(service);

    expect(suggestions.headingFont).toBeUndefined();
    expect(suggestions.bodyFont).toBeUndefined();
  });

  it('keeps a name of 60 characters, the most a kit takes, counted once it is plain', async () => {
    const { service, firecrawl } = makeService();
    const name = 'A'.repeat(60);
    firecrawl.branding.mockResolvedValue(
      branding({
        headingFont: `"${name}"`,
        bodyFont: `${name}-fea3ea334779485b`,
      })
    );

    expect(await suggest(service)).toEqual({
      ...NOTHING,
      headingFont: name,
      bodyFont: name,
    });
  });

  it('offers one font without the other', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockResolvedValue(
      branding({ headingFont: 'Tajawal', bodyFont: 'sans-serif' })
    );

    const suggestions = await suggest(service);

    expect(suggestions.headingFont).toBe('Tajawal');
    expect(suggestions.bodyFont).toBeUndefined();
  });

  // The card tells a refused site apart by this status, and says to use the
  // brand's own website or add the logo by hand.
  it('answers 403, not 422, for a site the lookup refuses, and reads nothing', async () => {
    const { service, firecrawl } = makeService();
    firecrawl.branding.mockRejectedValue(
      new HttpException("This kind of site can't be read.", 403)
    );

    const err = await failure(suggest(service));

    expect(err?.getStatus()).toBe(403);
    expect(err?.message).toBe("This kind of site can't be read.");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ['could not read the site', 422],
    ['is out of credits', 402],
    ['is busy', 429],
    ['is unreachable', 503],
    ['took too long', 504],
    ['refused the request', 502],
  ])(
    'refuses with a 422 the card words as the site couldn’t be read when the web lookup service %s, its words for Samy left out',
    async (_, status) => {
      const { service, firecrawl } = makeService();
      firecrawl.branding.mockRejectedValue(
        new HttpException(
          'Say the lookup failed and offer to try again.',
          status
        )
      );

      const err = await failure(suggest(service));

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This site couldn't be read.");
      expect(read).not.toHaveBeenCalled();
    }
  );

  it('throws an error that is no refusal of the lookup as it is', async () => {
    const { service, firecrawl } = makeService();
    const bug = new TypeError('branding is not iterable');
    firecrawl.branding.mockRejectedValue(bug);

    await expect(suggest(service)).rejects.toBe(bug);
  });

  // readOrFetch reads any string that doesn't start with a lower-case "http"
  // as a local file's path, and a link in Firecrawl's answer is the site's own
  // text. The guard is FirecrawlService's, so these cases run the real one
  // over a mocked fetch: what it hands on is what is read here.
  describe('over the real FirecrawlService', () => {
    // Firecrawl's answer for a site whose logo is the link, in both places it
    // names one, beside an icon at a link that can be read.
    const answered = (logo: string) =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            branding: { logo, images: { logo, favicon: ICON } },
            metadata: { url: 'https://www.noordental.example/' },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    beforeEach(() => {
      jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it.each([
      ['a data: address', 'data:image/svg+xml;base64,PHN2Zy8+'],
      ['a relative path', '/assets/logo.png'],
      ['a file: address', 'file:///etc/passwd'],
      ['a path on this machine', '/etc/passwd'],
    ])(
      'only http(s) links are read: a logo Firecrawl gave as %s never reaches readOrFetch, and the icon beside it does',
      async (_, logo) => {
        // Firecrawl itself is answered for; nothing reaches the network.
        jest.spyOn(global, 'fetch').mockResolvedValue(answered(logo));
        site[ICON] = await navy(192);
        const service = new BrandWebsiteService(
          new FirecrawlService(),
          {} as any,
          {} as any
        );

        const { logos } = await suggest(service);

        expect(read.mock.calls.map(([link]) => link)).toEqual([ICON]);
        expect(logos).toEqual([ICON]);
      }
    );
  });
});

describe('BrandWebsiteService.saveFromWebsite', () => {
  it('reads the logo through readOrFetch, bounded by the size the Media library takes for an image, each request waiting at most 5 s, saves it to Media and puts it in the kit with the colours, answering the saved brand', async () => {
    const { service, media, brands } = makeService();
    const logo = await mark(RED, CLEAR);
    site['https://cdn.example/logo.png'] = logo;

    const saved = await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo.png',
      colours: ['#E30613'],
    });

    expect(read).toHaveBeenCalledWith(
      'https://cdn.example/logo.png',
      10 * 1024 * 1024,
      5_000
    );
    expect(media.saveImage).toHaveBeenCalledWith('org-1', logo, 'image/png');
    expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
      logoId: 'media-10',
      colours: ['#B5542C', '#1F3A5F', '#E30613'],
    });
    expect(saved).toEqual({ ...rawda, id: 'saved' });
  });

  // Every browser and network shows these, so the bytes the site serves are
  // the ones saved.
  it.each([
    ['a JPEG', 'jpeg', 'https://cdn.example/logo.jpg', 'image/jpeg'],
    ['a WebP', 'webp', 'https://cdn.example/logo.webp', 'image/webp'],
  ] as const)(
    'saves %s logo as it is, with its type',
    async (_, format, link, mime) => {
      const { service, media } = makeService();
      const logo = await sharp(await mark(RED, WHITE))
        .toFormat(format)
        .toBuffer();
      site[link] = logo;

      await service.saveFromWebsite('org-1', 'brand-1', {
        logo: link,
        colours: [],
      });

      expect(media.saveImage).toHaveBeenCalledWith('org-1', logo, mime);
    }
  );

  // A logo is a still, in a type every network takes.
  it('saves a GIF logo as the PNG of its first frame, at its own size', async () => {
    const { service, media } = makeService();
    const gif = await twoFrameGif();
    expect((await sharp(gif).metadata()).pages).toBe(2);
    site['https://cdn.example/logo.gif'] = gif;

    await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo.gif',
      colours: [],
    });

    expect(media.saveImage).toHaveBeenCalledWith(
      'org-1',
      expect.any(Buffer),
      'image/png'
    );
    const png: Buffer = media.saveImage.mock.calls[0][1];
    // One frame, not the two stacked 40×80
    expect(await sharp(png).metadata()).toMatchObject({
      format: 'png',
      width: 40,
      height: 40,
    });
    expect(await pixelsOf(png)).toEqual(await pixelsOf(gif));
  });

  it.each([
    ['an AVIF', 'avif'],
    ['a TIFF', 'tiff'],
  ] as const)(
    'saves %s logo as the PNG it draws, at its own size',
    async (_, format) => {
      const { service, media } = makeService();
      const logo = await sharp(await mark(RED, CLEAR))
        .toFormat(format)
        .toBuffer();
      site['https://cdn.example/logo'] = logo;

      await service.saveFromWebsite('org-1', 'brand-1', {
        logo: 'https://cdn.example/logo',
        colours: [],
      });

      expect(media.saveImage).toHaveBeenCalledWith(
        'org-1',
        expect.any(Buffer),
        'image/png'
      );
      const png: Buffer = media.saveImage.mock.calls[0][1];
      expect(await sharp(png).metadata()).toMatchObject({
        format: 'png',
        width: 40,
        height: 40,
      });
      expect(await pixelsOf(png)).toEqual(await pixelsOf(logo));
    }
  );

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
    brands.get.mockResolvedValue({
      ...rawda,
      kit: {
        ...rawda.kit,
        colours: ['#111111', '#222222', '#333333', '#444444', '#555555'],
      },
    });

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

    expect(read).not.toHaveBeenCalled();
    expect(media.saveImage).not.toHaveBeenCalled();
    expect(brands.saveKit.mock.calls[0][2]).not.toHaveProperty('logoId');
  });

  it('puts the fonts that were sent in the kit, beside the logo and the colours', async () => {
    const { service, brands } = makeService();
    site['https://cdn.example/logo.png'] = await mark(RED, CLEAR);

    await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo.png',
      colours: ['#E30613'],
      headingFont: 'Tajawal',
      bodyFont: 'IBM Plex Sans Arabic',
    });

    expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
      logoId: 'media-10',
      colours: ['#B5542C', '#1F3A5F', '#E30613'],
      headingFont: 'Tajawal',
      bodyFont: 'IBM Plex Sans Arabic',
    });
  });

  // A font the user left unticked isn't sent, and the kit's own name stays
  // only if the field never reaches saveKit.
  it('passes no font that wasn’t sent, so the kit’s name stays', async () => {
    const { service, brands } = makeService();

    await service.saveFromWebsite('org-1', 'brand-1', { colours: [] });

    const kit = brands.saveKit.mock.calls[0][2];
    expect(kit).not.toHaveProperty('headingFont');
    expect(kit).not.toHaveProperty('bodyFont');
  });

  it.each([
    ['headingFont', 'bodyFont'],
    ['bodyFont', 'headingFont'],
  ] as const)(
    'passes %s when it alone was sent, and no %s',
    async (sent, unsent) => {
      const { service, brands } = makeService();

      await service.saveFromWebsite('org-1', 'brand-1', {
        colours: [],
        [sent]: 'Tajawal',
      });

      const kit = brands.saveKit.mock.calls[0][2];
      expect(kit).toHaveProperty(sent, 'Tajawal');
      expect(kit).not.toHaveProperty(unsent);
    }
  );

  // The DTO clears an emptied name to null, which saveKit takes as "no font".
  it('passes a font that was sent emptied as null, which clears the kit’s', async () => {
    const { service, brands } = makeService();

    await service.saveFromWebsite('org-1', 'brand-1', {
      colours: [],
      headingFont: null,
      bodyFont: 'Cairo',
    });

    const kit = brands.saveKit.mock.calls[0][2];
    expect(kit).toHaveProperty('headingFont', null);
    expect(kit).toHaveProperty('bodyFont', 'Cairo');
  });

  // Nothing reaches Media before sharp has read the image, so a link that is
  // no image leaves nothing behind there.
  it.each([
    ['the site does not serve it', 'https://cdn.example/gone.png'],
    ['it is a video', 'https://cdn.example/intro.mp4'],
    ['it is a page', 'https://cdn.example/about'],
    ['it is an ICO (sharp can’t read one)', 'https://cdn.example/x.ico'],
  ])(
    'refuses a logo when %s with a 422 and saves nothing, to Media or the kit',
    async (_, logo) => {
      const { service, media, brands } = makeService();
      site['https://cdn.example/intro.mp4'] = MP4;
      site['https://cdn.example/about'] = Buffer.from('<!doctype html>');
      site['https://cdn.example/x.ico'] = ico();

      const err = await failure(
        service.saveFromWebsite('org-1', 'brand-1', {
          logo,
          colours: ['#E30613'],
        })
      );

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This logo couldn't be saved.");
      expect(media.saveImage).not.toHaveBeenCalled();
      expect(brands.saveKit).not.toHaveBeenCalled();
    }
  );

  // The Media library takes no SVG, which can carry a script, so an SVG logo
  // is saved as the PNG it draws. It is drawn at that size rather than drawn
  // small and enlarged, so its edges stay sharp.
  it.each([
    [80, 40],
    [4000, 2000],
  ])(
    'saves an SVG logo of %i×%i as a PNG 1024 pixels on its long side, its transparency kept and its edges sharp',
    async (width, height) => {
      const { service, media, brands } = makeService();
      // A navy band down the middle half, nothing on either side
      const [start, span] = [width / 4, width / 2];
      site['https://cdn.example/brand/logo.svg'] = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
          `<rect x="${start}" width="${span}" height="${height}" fill="#1F3A5F"/></svg>`
      );

      await service.saveFromWebsite('org-1', 'brand-1', {
        logo: 'https://cdn.example/brand/logo.svg',
        colours: [],
      });

      expect(media.saveImage).toHaveBeenCalledWith(
        'org-1',
        expect.any(Buffer),
        'image/png'
      );
      const png: Buffer = media.saveImage.mock.calls[0][1];
      expect(await sharp(png).metadata()).toMatchObject({
        format: 'png',
        width: 1024,
        height: 512,
        hasAlpha: true,
      });
      // The pixels along the middle row; the band starts at x 256, so a small
      // drawing enlarged would blend the pixels either side of it
      const row = await sharp(png)
        .extract({ left: 0, top: 256, width: 1024, height: 1 })
        .raw()
        .toBuffer();
      const pixel = (x: number) => [...row.subarray(x * 4, x * 4 + 4)];
      expect(pixel(0)[3]).toBe(0);
      expect(pixel(248)[3]).toBe(0);
      expect(pixel(264)).toEqual([0x1f, 0x3a, 0x5f, 255]);
      expect(brands.saveKit).toHaveBeenCalledWith('org-1', 'brand-1', {
        logoId: 'media-10',
        colours: ['#B5542C', '#1F3A5F'],
      });
    }
  );

  it('reads an SVG logo through readOrFetch, bounded by the size the Media library takes for an image, each request waiting at most 5 s', async () => {
    const { service } = makeService();
    site['https://cdn.example/logo.svg'] = Buffer.from(SQUARE_SVG);

    await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo.svg',
      colours: [],
    });

    expect(read).toHaveBeenCalledWith(
      'https://cdn.example/logo.svg',
      10 * 1024 * 1024,
      5_000
    );
  });

  // A link's path can name no type ("/logo?fm=svg") or the wrong one.
  it('tells an SVG by its bytes, not its link: one at a link with no type is drawn as a PNG, and a PNG at a link ending in .svg is saved as it is', async () => {
    const { service, media } = makeService();
    site['https://cdn.example/logo?fm=svg'] = Buffer.from(SQUARE_SVG);
    const mislabelled = await mark(RED, CLEAR);
    site['https://cdn.example/brand/Logo.SVG?v=2'] = mislabelled;

    await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/logo?fm=svg',
      colours: [],
    });
    await service.saveFromWebsite('org-1', 'brand-1', {
      logo: 'https://cdn.example/brand/Logo.SVG?v=2',
      colours: [],
    });

    const [[, drawn, drawnType], [, kept, keptType]] =
      media.saveImage.mock.calls;
    expect(drawnType).toBe('image/png');
    expect(await sharp(drawn).metadata()).toMatchObject({
      format: 'png',
      width: 1024,
      height: 1024,
    });
    expect([kept, keptType]).toEqual([mislabelled, 'image/png']);
  });

  it.each([
    ['the site does not serve it', 'https://cdn.example/gone.svg'],
    ['its bytes draw nothing', 'https://cdn.example/page.svg'],
  ])(
    'refuses an SVG logo when %s with a 422 and saves nothing',
    async (_, logo) => {
      const { service, media, brands } = makeService();
      site['https://cdn.example/page.svg'] = Buffer.from('<!doctype html>');

      const err = await failure(
        service.saveFromWebsite('org-1', 'brand-1', {
          logo,
          colours: ['#E30613'],
        })
      );

      expect(err?.getStatus()).toBe(422);
      expect(err?.message).toBe("This logo couldn't be saved.");
      expect(media.saveImage).not.toHaveBeenCalled();
      expect(brands.saveKit).not.toHaveBeenCalled();
    }
  );

  // The one brand is read, not the organization's list of them.
  it('reads the kit’s colours from the one brand, which refuses a brand that is not a live brand of the organization with a 404, before anything is read or saved', async () => {
    const { service, media, brands } = makeService();
    brands.get.mockRejectedValue(new HttpException('Brand not found', 404));

    const err = await failure(
      service.saveFromWebsite('org-1', 'brand-1', {
        logo: 'https://cdn.example/logo.png',
        colours: ['#E30613'],
      })
    );

    expect(brands.get).toHaveBeenCalledWith('org-1', 'brand-1');
    expect(err?.getStatus()).toBe(404);
    expect(err?.message).toBe('Brand not found');
    expect(read).not.toHaveBeenCalled();
    expect(media.saveImage).not.toHaveBeenCalled();
    expect(brands.saveKit).not.toHaveBeenCalled();
  });
});
