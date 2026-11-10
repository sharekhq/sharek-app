import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// The Brands page's limits. Exported so its fields and cards bound
// themselves to the same numbers rather than to a second copy of them.
export const BRAND_NAME_MAX = 60;
export const BRAND_EXAMPLES_MAX = 3;
export const BRAND_COLOURS_MAX = 6;
export const BRAND_FONT_MAX = 60;

// The brand chip's choices besides a brand's id: no kit, or each channel's own.
export const NO_BRAND = 'none';
export const EACH_BRAND = 'each';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// An emptied font field clears the font, as null does, rather than saving "".
const trimOrClear = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// A colour a kit takes: a 6-digit hex code, in either case. Exported so the
// website lookup offers a colour by the same rule rather than by a second
// copy of it.
export const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

// The addresses "Fill from my website" fetches: absolute http(s) only, since
// readOrFetch reads any other string as a local file's path.
const WEB_ADDRESS = { require_protocol: true, protocols: ['http', 'https'] };
const WEB_ADDRESS_MAX = 2048;

// readOrFetch tells a link from a path by a lower-case "http". A logo link is
// one the lookup answered, which always starts so.
const LOGO_LINK = /^https?:\/\//;

// The card's field takes a domain as people type it ("noordental.sa"), which
// is looked up on https://.
const withHttps = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const address = value.trim();
  return /^https?:\/\//i.test(address) ? address : `https://${address}`;
};

export class CreateBrandDto {
  // The page's field stops at 60; the existing rename route keeps its own rule.
  @Transform(trim)
  @IsString()
  @Length(1, BRAND_NAME_MAX)
  name: string;

  /** Honoured only when the organization has no live brand yet. */
  @IsOptional()
  @IsBoolean()
  moveUngrouped?: boolean;
}

/**
 * Only the fields present change, so two members editing different parts of
 * one kit don't overwrite each other; a list replaces that whole list. Null
 * clears the logo or a font, never a list, which is emptied with [].
 */
export class BrandKitDto {
  /** A Media id of the organization, never a URL. */
  @IsOptional()
  @IsUUID('all')
  logoId?: string | null;

  /** Media ids of the example posts, in display order. */
  @ValidateIf((o) => o.exampleIds !== undefined)
  @IsArray()
  @ArrayMaxSize(BRAND_EXAMPLES_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  exampleIds?: string[];

  /** Stored uppercase, so two cases of one code are the same colour twice. */
  @ValidateIf((o) => o.colours !== undefined)
  @IsArray()
  @ArrayMaxSize(BRAND_COLOURS_MAX)
  @ArrayUnique((colour: unknown) => String(colour).toUpperCase())
  @Matches(HEX_COLOUR, { each: true })
  colours?: string[];

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(BRAND_FONT_MAX)
  headingFont?: string | null;

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(BRAND_FONT_MAX)
  bodyFont?: string | null;
}

/** The site to suggest a logo, colours and fonts from. Saves nothing. */
export class BrandWebsiteDto {
  @Transform(withHttps)
  @IsString()
  @MaxLength(WEB_ADDRESS_MAX)
  @IsUrl(WEB_ADDRESS)
  url: string;
}

/**
 * What the user kept from the lookup: the logo they picked, saved to the Media
 * library and put in the kit; the colours they left ticked, added after the
 * kit's own; and the fonts they left ticked, each in place of the kit's. A
 * font that isn't sent leaves the kit's as it is.
 */
export class BrandKitFromWebsiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(WEB_ADDRESS_MAX)
  @IsUrl(WEB_ADDRESS)
  @Matches(LOGO_LINK)
  logo?: string;

  @IsArray()
  @ArrayMaxSize(BRAND_COLOURS_MAX)
  @ArrayUnique((colour: unknown) => String(colour).toUpperCase())
  @Matches(HEX_COLOUR, { each: true })
  colours: string[];

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(BRAND_FONT_MAX)
  headingFont?: string | null;

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(BRAND_FONT_MAX)
  bodyFont?: string | null;
}
