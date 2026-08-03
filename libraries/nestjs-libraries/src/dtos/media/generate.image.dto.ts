import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_PROMPT_MAX_CHARS,
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
}
