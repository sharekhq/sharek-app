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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// An emptied font field clears the font, as null does, rather than saving "".
const trimOrClear = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateBrandDto {
  // The page's field stops at 60; the existing rename route keeps its own rule.
  @Transform(trim)
  @IsString()
  @Length(1, 60)
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
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  exampleIds?: string[];

  /** Stored uppercase, so two cases of one code are the same colour twice. */
  @ValidateIf((o) => o.colours !== undefined)
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique((colour: unknown) => String(colour).toUpperCase())
  @Matches(/^#[0-9A-Fa-f]{6}$/, { each: true })
  colours?: string[];

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(60)
  headingFont?: string | null;

  @IsOptional()
  @Transform(trimOrClear)
  @IsString()
  @MaxLength(60)
  bodyFont?: string | null;
}
