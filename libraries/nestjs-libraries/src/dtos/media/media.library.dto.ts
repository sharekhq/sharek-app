import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { GetMediaDto } from './get.media.dto';

// The most ids one DELETE /media takes. Exported so the client sends a larger
// selection in batches of the same size rather than of a second copy of it.
export const MEDIA_DELETE_BATCH = 500;

const MEDIA_TYPES = ['image', 'image-static', 'video'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

export class MediaLibraryDto extends GetMediaDto {
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  type?: MediaType;

  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';
}

export class MediaMonthDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(MEDIA_TYPES)
  type?: MediaType;
}

export class DeleteMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MEDIA_DELETE_BATCH)
  @IsString({ each: true })
  ids: string[];
}
