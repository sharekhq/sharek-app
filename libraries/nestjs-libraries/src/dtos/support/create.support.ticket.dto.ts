import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export const SUPPORT_CATEGORIES = [
  'channels',
  'billing',
  'technical',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

// A real build stamps NEXT_PUBLIC_VERSION with the commit SHA — 40 characters —
// so a bound below that rejects every submission from the deployed image while
// passing locally, where the variable is unset and the field never appears.
// Exported so the sender bounds itself to the same number rather than to a
// second copy of it.
export const SUPPORT_APP_VERSION_MAX = 64;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateSupportTicketDto {
  // No default: the customer chose nothing, and filing that as "other" would
  // route the enquiry on a guess the form deliberately refuses to make.
  @IsIn(SUPPORT_CATEGORIES)
  category: SupportCategory;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  subject: string;

  // The same 2000 the counter in front of the customer stops at (FR-005).
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  message: string;

  @IsString()
  @Length(2, 10)
  @Matches(/^[a-zA-Z-]+$/)
  locale: string;

  // Everything below is advisory diagnostic text an agent reads — none of it
  // makes a decision (research R14). It is bounded anyway, because an unbounded
  // user-controlled string forwarded to a third-party API is how you get an
  // oversized-payload rejection.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SUPPORT_APP_VERSION_MAX)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  viewport?: string;

  // Echoed into a ticket body an agent will read and click, so it has to stay an
  // in-app path: anything carrying a scheme or a protocol-relative prefix would
  // render in the help desk as an off-site link.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^\/(?!\/)/)
  fromPath?: string;
}
