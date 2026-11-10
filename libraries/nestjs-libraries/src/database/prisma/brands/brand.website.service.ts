import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { partition, uniq } from 'lodash';
import { extname } from 'path';
import sharp from 'sharp';
import { TavilyService } from '@gitroom/nestjs-libraries/tavily/tavily.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  Brand,
  BrandService,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { readOrFetch } from '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { BRAND_COLOURS_MAX } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

export type WebsiteSuggestions = {
  foundOn: string;
  logos: string[];
  colours: string[];
};

type WebPage = Awaited<ReturnType<TavilyService['extract']>>[number];
type Pixels = { data: Buffer; info: { width: number; height: number } };
type Rgb = number[];

// The logo links the card offers to pick from
const LOGOS_MAX = 6;

// So a page whose first links are broken still gets colours, without every
// candidate being fetched
const COLOUR_READS = 3;

// A logo is sampled inside this many pixels, enough to count its colours
const SAMPLE_EDGE = 64;

// An SVG logo is saved as a PNG this many pixels on its long side
const SVG_EDGE = 1024;

// The Media library takes an image up to this size, so a larger logo couldn't
// be saved to the kit
const LOGO_MAX_BYTES = getMaxSize('image/png');

// Each request of a logo's read (its HEAD and its GET) waits at most this
// long, so a lookup's reads end within 30 s beside Tavily's 20 s, well inside
// nginx's 95 s. A read that runs out of time is a link that can't be read.
const LOGO_READ_TIMEOUT = 5_000;

// The card says each of these in its own words.
const UNREADABLE_SITE = "This site couldn't be read.";
const UNREADABLE_IMAGE = "This image couldn't be read.";
const UNSAVED_LOGO = "This logo couldn't be saved.";

// A path that names a logo ("/img/logo.svg", "/brand/Site-Logo.png"). The host
// and the query say nothing about the image itself.
const namesLogo = (link: string) => /logo/i.test(new URL(link).pathname);

// The type a link's path ends in ("/brand/Logo.SVG?v=2" is ".svg"), the only
// one a page's image link carries
const typeOf = (link: string) => extname(new URL(link).pathname).toLowerCase();

const candidatesOf = ({ images = [], favicon }: WebPage) => {
  const [named, others] = partition(images, namesLogo);
  return (
    uniq([...named, ...others, ...(favicon ? [favicon] : [])])
      // Neither sharp nor the Media library takes an ICO, a favicon's usual type
      .filter((link) => typeOf(link) !== '.ico')
      .slice(0, LOGOS_MAX)
  );
};

// The PNG an SVG draws, SVG_EDGE pixels on its long side and transparent where
// it draws nothing. It is drawn at that size, since one drawn at its own size
// and enlarged would be blurred.
const pngOf = async (svg: Buffer) => {
  const { width, height } = await sharp(svg).metadata();
  return sharp(svg, { density: (72 * SVG_EDGE) / Math.max(width, height) })
    .resize(SVG_EDGE, SVG_EDGE, { fit: 'inside' })
    .png()
    .toBuffer();
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

    const candidates = candidatesOf(page);
    if (!candidates.length && page.error) {
      throw new HttpException(UNREADABLE_SITE, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const unreadable: string[] = [];
    let colours: string[] = [];
    for (const logo of candidates.slice(0, COLOUR_READS)) {
      const pixels = await this.pixelsOf(logo);
      if (pixels) {
        colours = coloursIn(pixels);
        break;
      }
      unreadable.push(logo);
    }

    return {
      foundOn: new URL(url).host,
      logos: candidates.filter((logo) => !unreadable.includes(logo)),
      colours,
    };
  }

  async coloursFromLogo(link: string): Promise<string[]> {
    const pixels = await this.pixelsOf(link);
    if (!pixels) {
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

  // The Media library takes no SVG, which can carry a script, so an SVG logo is
  // saved as the PNG it draws, its bytes read as the colours' are
  private async saveLogo(org: string, logo: string) {
    if (typeOf(logo) !== '.svg') {
      try {
        return await this._mediaService.uploadFromUrl(org, logo);
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw new HttpException(
            UNSAVED_LOGO,
            HttpStatus.UNPROCESSABLE_ENTITY
          );
        }
        throw err;
      }
    }

    let png: Buffer;
    try {
      png = await pngOf(
        await readOrFetch(logo, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT)
      );
    } catch {
      // A link the site doesn't serve, or bytes that draw nothing
      throw new HttpException(UNSAVED_LOGO, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    return this._mediaService.saveImage(org, png, 'image/png');
  }

  // An image sharp can't read (an ICO, a page that isn't one) or a link that
  // can't be fetched is the site's, not a failure of ours
  private async pixelsOf(link: string): Promise<Pixels | undefined> {
    try {
      return await sharp(
        await readOrFetch(link, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT)
      )
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
    } catch {
      return undefined;
    }
  }
}
