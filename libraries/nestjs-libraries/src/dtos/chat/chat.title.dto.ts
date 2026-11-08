import { Transform } from 'class-transformer';
import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class ChatTitleDto {
  @IsString()
  @IsDefined()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(100)
  title: string;
}
