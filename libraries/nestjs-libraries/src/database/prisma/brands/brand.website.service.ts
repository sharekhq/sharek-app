import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { compact, sortBy, uniq } from 'lodash';
import { basename, extname } from 'path';
import sharp, { FormatEnum, Metadata } from 'sharp';
import {
  TavilyService,
  WebPage,
} from '@gitroom/nestjs-libraries/tavily/tavily.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  Brand,
  BrandService,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { readOrFetch } from '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { BRAND_COLOURS_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

type WebsiteSuggestions = {
  foundOn: string;
  logos: string[];
  colours: string[];
};

type Pixels = { data: Buffer; info: { width: number; height: number } };
type Rgb = number[];
type Candidate = { link: string; metadata?: Metadata };
type Logo = { link: string; image: Buffer; metadata: Metadata };
type LogoOrder = ((candidate: Candidate) => boolean)[];

// The logo links the card offers to pick from
const LOGOS_MAX = 6;

// The links read for them: twice as many, so a page whose first links are
// broken still fills the 6, without every image on a page being fetched
const READS_MAX = 12;

// An opaque image this many pixels or more on its long side is more like a
// photo or a banner than a logo, which is mostly smaller or transparent around
// its mark
const PHOTO_EDGE = 800;

// A logo is sampled inside this many pixels, enough to count its colours
const SAMPLE_EDGE = 64;

// An SVG logo is saved as a PNG this many pixels on its long side
const SVG_EDGE = 1024;

// The Media library takes an image up to this size, so a larger logo couldn't
// be saved to the kit
const LOGO_MAX_BYTES = getMaxSize('image/png');

// Each request of a logo's read (its HEAD and its GET) waits at most this
// long. A lookup reads its links at once, so its reads end within 10 s beside
// Tavily's 20 s, well inside nginx's 95 s. A read that runs out of time is a
// link that can't be read.
const LOGO_READ_TIMEOUT = 5_000;

// The card says each of these in its own words.
const UNREADABLE_SITE = "This site couldn't be read.";
const UNREADABLE_IMAGE = "This image couldn't be read.";
const UNSAVED_LOGO = "This logo couldn't be saved.";

// A path that names a logo ("/img/logo.svg", "/brand/Site-Logo.png"). The host
// and the query say nothing about the image itself.
const namesLogo = (link: string) => /logo/i.test(new URL(link).pathname);

// A word naming another kind of image a page has: a banner, a background, a
// photo, or one of its icons (a menu, a search, a close button, an arrow, a
// cart, a user's), each also in the plural
const OTHER_IMAGE =
  /^(banner|hero|slide|slider|background|bg|photo|icon|menu|search|close|arrow|hamburger|cart|user)s?$/;

// A path with such a word among its runs of letters, a camelCase name split
// ("/img/heroBanner_2x.jpg" is img, hero, banner, x and jpg). Only a whole
// word counts: "cartier" or "iconic" says nothing.
const namesOtherImage = (link: string) =>
  (
    new URL(link).pathname
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .match(/[a-z]+/g) ?? []
  ).some((word) => OTHER_IMAGE.test(word));

// The brand's name as the site's address gives it: the first part of its host,
// before the last, of 3 characters or more and not "www" ("almarai" of
// www.almarai.com, "kaust" of kaust.edu.sa, "unicef" of en.unicef.org). A
// shorter part ("ar", "en") is in too many file names to tell anything.
const brandNameOf = (url: string) =>
  new URL(url).hostname
    .split('.')
    .slice(0, -1)
    .find((part) => part.length >= 3 && part !== 'www');

// The type a link's path ends in ("/brand/Logo.SVG?v=2" is ".svg"), the only
// one a page's image link carries
const typeOf = (link: string) => extname(new URL(link).pathname).toLowerCase();

/**
 * The order the card offers the links in, as lodash sortBy's keys, each true
 * for a link that goes after (links alike keep the page's order, the favicon
 * after its images):
 * - a path that doesn't name a logo;
 * - a path naming another kind of image, never the favicon's: it is the site's
 *   own mark, whatever its path says;
 * - a file name without the brand's name;
 * - not an SVG;
 * - once read, an image like a photo: opaque and PHOTO_EDGE pixels or more on
 *   its long side.
 */
const logoOrderOf = (url: string, favicon?: string): LogoOrder => {
  const brand = brandNameOf(url);
  return [
    ({ link }) => !namesLogo(link),
    ({ link }) => link !== favicon && namesOtherImage(link),
    ({ link }) =>
      !brand || !basename(new URL(link).pathname).toLowerCase().includes(brand),
    ({ link }) => typeOf(link) !== '.svg',
    ({ metadata }) =>
      !!metadata &&
      !metadata.hasAlpha &&
      Math.max(metadata.width, metadata.height) >= PHOTO_EDGE,
  ];
};

// The links read for logos, the page's images and its favicon each once: the
// first READS_MAX in the order their paths give
const candidatesOf = ({ images = [], favicon }: WebPage, order: LogoOrder) =>
  sortBy(
    uniq([...images, ...(favicon ? [favicon] : [])])
      // Neither sharp nor the Media library takes an ICO, a favicon's usual type
      .filter((link) => typeOf(link) !== '.ico')
      .map((link) => ({ link })),
    order
  ).slice(0, READS_MAX);

// A link's image, read as a logo's bytes are; none when the link can't be
// fetched or its bytes are no image sharp reads (the page itself, a video, an
// ICO), whatever its path says
const logoAt = async ({ link }: Candidate): Promise<Logo | undefined> => {
  try {
    const image = await readOrFetch(link, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT);
    return { link, image, metadata: await sharp(image).metadata() };
  } catch {
    return undefined;
  }
};

// The pixels a logo's colours are read from
const pixelsOf = (image: Buffer): Promise<Pixels> =>
  sharp(image)
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
      // No blend of two colours is made by the sampling
      kernel: 'nearest',
    })
    // A greyscale or CMYK image comes out as RGB too
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

// A logo of these types is saved as the site serves it: the Media library
// takes them and every browser and network shows them
const KEPT_TYPES: Partial<Record<keyof FormatEnum, string>> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

// The PNG an image draws, transparent where it draws nothing; a GIF's is its
// first frame. An SVG is drawn SVG_EDGE pixels on its long side, at that size,
// since one drawn at its own size and enlarged would be blurred; any other
// image keeps its own size.
const pngOf = (image: Buffer, { format, width, height }: Metadata) =>
  (format === 'svg'
    ? sharp(image, {
        density: (72 * SVG_EDGE) / Math.max(width, height),
      }).resize(SVG_EDGE, SVG_EDGE, { fit: 'inside' })
    : sharp(image)
  )
    .png()
    .toBuffer();

// The file a logo is saved as, once sharp has read it, so bytes that are no
// image (a page, a video, an ICO) are refused before anything is saved. Any
// other type is saved as the PNG it draws: the Media library takes no SVG,
// which can carry a script, and a GIF, AVIF or TIFF logo is then a still that
// every network shows.
const logoFileOf = async (image: Buffer) => {
  const metadata = await sharp(image).metadata();
  const kept = KEPT_TYPES[metadata.format];
  return kept
    ? { image, mime: kept }
    : { image: await pngOf(image, metadata), mime: 'image/png' };
};

// Pixels are counted in boxes 32 values wide on each channel. The lightest box
// is near-white and the darkest near-black.
const boxOf = (r: number, g: number, b: number) =>
  ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
const WHITE_BOX = boxOf(255, 255, 255);
const BLACK_BOX = boxOf(0, 0, 0);

const hex = (colour: Rgb) =>
  `#${colour
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

// Shades this close on every channel are one colour
const sameColour = (one: Rgb, other: Rgb) =>
  one.every((channel, n) => Math.abs(channel - other[n]) < 32);

/**
 * The logo's colours, the most covered first. A pixel mostly transparent is
 * left out. Near-white or near-black is left out only as the background, when
 * it is most of the image's edge, so a black logo keeps its black. A colour on
 * under 1 in 50 of the pixels counted is left out, such as the blend along an
 * edge between two colours.
 */
const coloursIn = ({ data, info: { width, height } }: Pixels) => {
  const boxes = new Map<number, { sum: Rgb; pixels: number }>();
  const edge = new Map<number, number>();
  let edgePixels = 0;

  for (let i = 0; i < width * height; i++) {
    const [r, g, b, alpha] = data.subarray(i * 4, i * 4 + 4);
    const x = i % width;
    const y = Math.floor(i / width);
    const onEdge = !x || !y || x === width - 1 || y === height - 1;
    edgePixels += onEdge ? 1 : 0;
    if (alpha < 128) {
      continue;
    }

    const box = boxOf(r, g, b);
    if (onEdge) {
      edge.set(box, (edge.get(box) ?? 0) + 1);
    }
    const counted = boxes.get(box) ?? { sum: [0, 0, 0], pixels: 0 };
    boxes.set(box, {
      sum: [counted.sum[0] + r, counted.sum[1] + g, counted.sum[2] + b],
      pixels: counted.pixels + 1,
    });
  }

  for (const background of [WHITE_BOX, BLACK_BOX]) {
    if ((edge.get(background) ?? 0) > edgePixels / 2) {
      boxes.delete(background);
    }
  }

  const ranked = [...boxes.values()].sort(
    (one, other) => other.pixels - one.pixels
  );
  const total = ranked.reduce((sum, { pixels }) => sum + pixels, 0);
  const colours: Rgb[] = [];
  for (const { sum, pixels } of ranked) {
    if (pixels * 50 < total || colours.length === BRAND_COLOURS_MAX) {
      break;
    }
    const colour = sum.map((channel) => Math.round(channel / pixels));
    if (!colours.some((taken) => sameColour(taken, colour))) {
      colours.push(colour);
    }
  }

  return colours.map(hex);
};

/**
 * "Fill from my website" on a brand's page and in onboarding (research R15).
 * Its own service because MediaService depends on BrandService, so BrandService
 * can't depend back on MediaService (C16).
 */
@Injectable()
export class BrandWebsiteService {
  constructor(
    private _tavilyService: TavilyService,
    private _mediaService: MediaService,
    private _brandService: BrandService
  ) {}

  // Saves nothing. The colours are those of the first logo, so a link whose
  // image can't be read is left out of the logos rather than put first.
  async suggestFromWebsite(
    org: string,
    url: string
  ): Promise<WebsiteSuggestions> {
    let page: WebPage;
    try {
      [page] = await this._tavilyService.extract(org, [url], { images: true });
    } catch (err) {
      // Tavily's own words are written for Samy to relay
      if (err instanceof HttpException) {
        throw new HttpException(
          UNREADABLE_SITE,
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
      throw err;
    }

    const order = logoOrderOf(url, page.favicon);
    const candidates = candidatesOf(page, order);
    if (!candidates.length && page.error) {
      throw new HttpException(UNREADABLE_SITE, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    // The links are read at once, so the lookup waits for its slowest read
    // only. Read, they're put in order again with what each image is.
    const logos = sortBy(
      compact(await Promise.all(candidates.map(logoAt))),
      order
    ).slice(0, LOGOS_MAX);

    return {
      foundOn: new URL(url).host,
      logos: logos.map(({ link }) => link),
      // An image cut short can have a header sharp reads and no pixels
      colours: logos.length
        ? await pixelsOf(logos[0].image).then(coloursIn, () => [])
        : [],
    };
  }

  async coloursFromLogo(link: string): Promise<string[]> {
    let pixels: Pixels;
    try {
      pixels = await pixelsOf(
        await readOrFetch(link, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT)
      );
    } catch {
      // A link the site doesn't serve, or bytes sharp can't read (an ICO, a
      // page that isn't one)
      throw new HttpException(
        UNREADABLE_IMAGE,
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return coloursIn(pixels);
  }

  // The logo goes to the Media library first, so a logo that can't be fetched
  // saves nothing. The kit keeps its own colours first.
  async saveFromWebsite(
    org: string,
    brandId: string,
    { logo, colours }: { logo?: string; colours: string[] }
  ): Promise<Brand> {
    const { kit } = await this._brandService.get(org, brandId);
    const saved = logo ? await this.saveLogo(org, logo) : undefined;

    return this._brandService.saveKit(org, brandId, {
      ...(saved ? { logoId: saved.id } : {}),
      colours: uniq([
        ...kit.colours,
        ...colours.map((colour) => colour.toUpperCase()),
      ]).slice(0, BRAND_COLOURS_MAX),
    });
  }

  // A logo's bytes are read as the colours' are, bounded by what the Media
  // library takes for an image
  private async saveLogo(org: string, logo: string) {
    let file: { image: Buffer; mime: string };
    try {
      file = await logoFileOf(
        await readOrFetch(logo, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT)
      );
    } catch {
      // A link the site doesn't serve, a file over the bound, or bytes sharp
      // can't read
      throw new HttpException(UNSAVED_LOGO, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return this._mediaService.saveImage(org, file.image, file.mime);
  }
}
