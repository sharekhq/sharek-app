import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// An emptied font field clears the font, as null does, rather than saving "".
const trimOrClear = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

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
  @Matches(/^#[0-9A-Fa-f]{6}$/, { each: true })
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
