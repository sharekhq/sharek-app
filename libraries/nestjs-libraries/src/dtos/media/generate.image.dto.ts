import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_PROMPT_MAX_CHARS,
  IMAGE_REFERENCE_MAX,
  IMAGE_STYLE_IDS,
  ImageAspectId,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

export class GenerateImageWithPromptDto {
  /** The user's description, verbatim — the client splices nothing into it. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(IMAGE_PROMPT_MAX_CHARS)
  prompt: string;

  @IsIn(IMAGE_ASPECT_IDS)
  aspectRatio: ImageAspectId;

  /** Omitted entirely when the user leaves the style on Auto. */
  @IsOptional()
  @IsIn(IMAGE_STYLE_IDS)
  style?: string;

  /**
   * Media ids, in the order the user numbered them, and never URLs: the server
   * reads only files its own storage wrote, and only the asking organization's
   * (FR-006). Omitted when nothing is attached, which is today's request.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMAGE_REFERENCE_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  references?: string[];
}
