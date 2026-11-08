import { IsBoolean, IsDefined } from 'class-validator';

export class ChatPinDto {
  @IsBoolean()
  @IsDefined()
  pinned: boolean;
}
