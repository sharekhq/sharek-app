import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { compact, uniq } from 'lodash';
import sharp, { FormatEnum, Metadata } from 'sharp';
import {
  FirecrawlService,
  SiteBranding,
  UNREADABLE_SITE,
} from '@gitroom/nestjs-libraries/firecrawl/firecrawl.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import {
  Brand,
  BrandService,
} from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { readOrFetch } from '@gitroom/nestjs-libraries/database/prisma/media/read.or.fetch';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import {
  BRAND_COLOURS_MAX,
  BRAND_FONT_MAX,
  HEX_COLOUR,
} from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

type WebsiteSuggestions = {
  foundOn: string;
  logos: string[];
  colours: string[];
  headingFont?: string;
  bodyFont?: string;
};

// A site's icon is offered as a logo from this many pixels on its short side.
// A touch icon is 180 or 192; a browser tab's is 64 or smaller, too little for
// the image model, which copies the kit's logo.
const ICON_EDGE = 128;

// An SVG logo is saved as a PNG this many pixels on its long side
const SVG_EDGE = 1024;

// The Media library takes an image up to this size, so a larger logo couldn't
// be saved to the kit
const LOGO_MAX_BYTES = getMaxSize('image/png');

// Each request of a logo's read (its HEAD and its GET) waits at most this
// long. A lookup reads its two links at once, so its reads end within 10 s
// beside Firecrawl's 30 s, well inside nginx's 95 s. A read that runs out of
// time is a link that can't be read.
const LOGO_READ_TIMEOUT = 5_000;

// The card says this, and the lookup's UNREADABLE_SITE, in its own words.
const UNSAVED_LOGO = "This logo couldn't be saved.";

// What sharp reads of the image at a link; nothing when the link can't be
// fetched or its bytes are no image sharp reads (a page, a video, an ICO),
// whatever its path says
const imageAt = async (link: string): Promise<Metadata | undefined> => {
  try {
    return await sharp(
      await readOrFetch(link, LOGO_MAX_BYTES, LOGO_READ_TIMEOUT)
    ).metadata();
  } catch {
    return undefined;
  }
};

// An icon that works as a logo: an SVG, which is drawn at any size, or an
// image big enough
const worksAsLogo = ({ format, width, height }: Metadata) =>
  format === 'svg' || Math.min(width, height) >= ICON_EDGE;

// The site's colours a kit can take, by the DTO's own rule, in capitals and
// each once, in the order given. Firecrawl's answer is handed on as it came,
// so a colour may be no hex code, or no text at all.
const coloursOf = (colours: unknown[]): string[] =>
  uniq(
    colours
      .filter((colour): colour is string => typeof colour === 'string')
      .map((colour) => colour.toUpperCase())
      .filter((colour) => HEX_COLOUR.test(colour))
  );

// The name a build gives a font it serves ends in a hyphen and 8 or more hex
// characters ("IBM Plex Sans-fea3ea334779485b")
const BUILD_SUFFIX = /-[0-9a-f]{8,}$/i;

// CSS's generic families and keywords, and the names a system's own font goes
// by, in lower case: none is a font a brand chose
const GENERIC_FONTS = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
];

// A font's plain family name, as a person would type it: the first family of
// a CSS font stack, without its quotes and outer spaces, and without a build's
// suffix. None for a generic family, an empty name, one longer than a kit
// takes, or a value that is no text.
const fontOf = (name: unknown): string | undefined => {
  if (typeof name !== 'string') {
    return undefined;
  }
  const plain = name
    .split(',')[0]
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .replace(BUILD_SUFFIX, '');
  return plain &&
    plain.length <= BRAND_FONT_MAX &&
    !GENERIC_FONTS.includes(plain.toLowerCase())
    ? plain
    : undefined;
};

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

/**
 * "Fill from my website" on a brand's page and in onboarding (research R15).
 * Its own service because MediaService depends on BrandService, so BrandService
 * can't depend back on MediaService (C16).
 */
@Injectable()
export class BrandWebsiteService {
  constructor(
    private _firecrawlService: FirecrawlService,
    private _mediaService: MediaService,
    private _brandService: BrandService
  ) {}

  // Saves nothing. Only an image sharp reads is offered as a logo, since the
  // kit could save no other.
  async suggestFromWebsite(
    org: string,
    url: string
  ): Promise<WebsiteSuggestions> {
    let site: SiteBranding;
    try {
      site = await this._firecrawlService.branding(org, url);
    } catch (err) {
      // The card tells a refused site apart by its 403. The lookup's other
      // words are written for Samy to relay
      if (
        err instanceof HttpException &&
        err.getStatus() !== HttpStatus.FORBIDDEN
      ) {
        throw new HttpException(
          UNREADABLE_SITE,
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
      throw err;
    }

    // The logo, then the icon when it is another link. Both are read at once,
    // so the lookup waits for the slower read only.
    const links = uniq(compact([site.logo, site.icon]));
    const images = await Promise.all(links.map(imageAt));
    const headingFont = fontOf(site.headingFont);
    const bodyFont = fontOf(site.bodyFont);

    return {
      // The address the site led to, which may not be the one asked
      foundOn: new URL(site.url).host,
      logos: links.filter(
        (link, n) => images[n] && (link === site.logo || worksAsLogo(images[n]))
      ),
      colours: coloursOf(site.colours),
      ...(headingFont ? { headingFont } : {}),
      ...(bodyFont ? { bodyFont } : {}),
    };
  }

  // The logo goes to the Media library first, so a logo that can't be fetched
  // saves nothing. The kit keeps its own colours first. A font is handed on
  // only when it was sent, null included, which clears the kit's: one that
  // wasn't sent leaves the kit's as it is.
  async saveFromWebsite(
    org: string,
    brandId: string,
    {
      logo,
      colours,
      headingFont,
      bodyFont,
    }: {
      logo?: string;
      colours: string[];
      headingFont?: string | null;
      bodyFont?: string | null;
    }
  ): Promise<Brand> {
    const { kit } = await this._brandService.get(org, brandId);
    const saved = logo ? await this.saveLogo(org, logo) : undefined;

    return this._brandService.saveKit(org, brandId, {
      ...(saved ? { logoId: saved.id } : {}),
      colours: uniq([
        ...kit.colours,
        ...colours.map((colour) => colour.toUpperCase()),
      ]).slice(0, BRAND_COLOURS_MAX),
      ...(headingFont !== undefined ? { headingFont } : {}),
      ...(bodyFont !== undefined ? { bodyFont } : {}),
    });
  }

  // A logo's bytes are read as a suggested logo's are, bounded by what the
  // Media library takes for an image
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
