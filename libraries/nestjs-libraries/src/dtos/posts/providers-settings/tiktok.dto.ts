import {
  IsBoolean,
  ValidateIf,
  IsIn,
  IsString,
  MaxLength,
  IsOptional,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

// TikTok discards every setting but the title / description when
// content_posting_method=UPLOAD, so neither cross-field rule below may refuse
// an upload: the post would be blocked over fields TikTok never reads.
const isDirectPost = (settings: any): boolean =>
  settings?.content_posting_method !== 'UPLOAD';

const TIKTOK_VISIBILITY_MESSAGE =
  'Choose who can see this post - one of PUBLIC_TO_EVERYONE, ' +
  'MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR or SELF_ONLY.';

// Both constraints must be total. posts.service.ts validates every selected
// provider inside a single Promise.all, so a constraint that throws on a
// half-filled object fails validation for every other channel in the post
// rather than just this one. Nothing below may assume a populated object.

@ValidatorConstraint({ name: 'IsTikTokDisclosureChoiceMade', async: false })
export class IsTikTokDisclosureChoiceMadeConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const settings = args?.object as any;

    if (!isDirectPost(settings) || !settings?.disclose) {
      return true;
    }

    return !!settings?.brand_organic_toggle || !!settings?.brand_content_toggle;
  }

  defaultMessage(_args: ValidationArguments): string {
    // TikTok's own wording. It is quoted verbatim on purpose: TikTok rejects
    // applications that paraphrase the sentences in its Content Sharing
    // Guidelines, and the composer shows this same sentence on hover.
    return 'You need to indicate if your content promotes yourself, a third party, or both.';
  }
}

export function IsTikTokDisclosureChoiceMade(
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsTikTokDisclosureChoiceMadeConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'IsTikTokBrandedContentNotPrivate', async: false })
export class IsTikTokBrandedContentNotPrivateConstraint
  implements ValidatorConstraintInterface
{
  validate(_value: unknown, args: ValidationArguments): boolean {
    const settings = args?.object as any;

    if (!isDirectPost(settings) || !settings?.brand_content_toggle) {
      return true;
    }

    return settings?.privacy_level !== 'SELF_ONLY';
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'Branded content visibility cannot be set to private.';
  }
}

export function IsTikTokBrandedContentNotPrivate(
  validationOptions?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsTikTokBrandedContentNotPrivateConstraint,
    });
  };
}

// TikTok only honors most of these settings on a DIRECT_POST. With
// content_posting_method=UPLOAD the media lands in the user's TikTok inbox as a
// draft, and TikTok's inbox/upload endpoints accept nothing but the title /
// description - every other field below is silently discarded.
// video_made_with_ai / duet / stitch are additionally video-only: TikTok's photo
// post_info has no is_aigc, disable_duet or disable_stitch field.
// Fields stay required here (existing clients depend on it). The two
// commercial-disclosure rules TikTok requires are enforced by the constraints
// above; the remaining per-field notes are documentation only.
export class TikTokDto {
  @ValidateIf((p) => p.title)
  @MaxLength(90)
  @JSONSchema({
    description:
      'Used as the title of the post. The only setting TikTok keeps when content_posting_method=UPLOAD.',
  })
  title: string;

  // Both constraints carry the same sentence on purpose. posts.service
  // surfaces Object.values(constraints)[0] and the composer prints it as
  // "TikTok (@account): <message>", so the default "privacy_level must be one
  // of the following values: ..." reached the creator as a field name and a
  // bare enum dump - and which of the two defaults they saw depended on key
  // order. The values stay in the text because the public API and the AI
  // assistant reach this same message and do need to know them.
  @ValidateIf((p) => isDirectPost(p))
  @IsIn(
    [
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'FOLLOWER_OF_CREATOR',
      'SELF_ONLY',
    ],
    { message: TIKTOK_VISIBILITY_MESSAGE }
  )
  @IsString({ message: TIKTOK_VISIBILITY_MESSAGE })
  @JSONSchema({
    description:
      'Who can see the post. Required when content_posting_method=DIRECT_POST, and must be ' +
      'one of the options TikTok reports for that specific account - public and private ' +
      'accounts are allowed different subsets. TikTok forbids pre-selecting a visibility, so ' +
      'there is no default and one must be chosen deliberately. Ignored by TikTok on UPLOAD, ' +
      'where it is not required.',
  })
  privacy_level:
    | 'PUBLIC_TO_EVERYONE'
    | 'MUTUAL_FOLLOW_FRIENDS'
    | 'FOLLOWER_OF_CREATOR'
    | 'SELF_ONLY';

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no duet setting for photo posts.',
  })
  duet: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no stitch setting for photo posts.',
  })
  stitch: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      'Applied only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  comment: boolean;

  @IsIn(['yes', 'no'])
  @JSONSchema({
    description:
      'Photo posts only, and only when content_posting_method=DIRECT_POST. Ignored by TikTok on UPLOAD.',
  })
  autoAddMusic: 'yes' | 'no';

  @IsBoolean()
  @IsOptional()
  @IsTikTokDisclosureChoiceMade()
  @JSONSchema({
    description:
      'Turns on the commercial content disclosure. Defaults to false. When true on a ' +
      'DIRECT_POST, at least one of brand_organic_toggle ("Your Brand") or ' +
      'brand_content_toggle ("Branded Content") must also be true, or the post is refused. ' +
      'Ignored by TikTok on UPLOAD.',
  })
  disclose: boolean;

  @IsBoolean()
  @IsTikTokBrandedContentNotPrivate()
  @JSONSchema({
    description:
      '"Branded Content" - the post promotes another brand or a third party, and TikTok ' +
      'labels it "Paid partnership". Only meaningful when disclose=true. Branded content ' +
      'may not be private: with this true on a DIRECT_POST, privacy_level cannot be ' +
      'SELF_ONLY. Ignored by TikTok on UPLOAD.',
  })
  brand_content_toggle: boolean;

  @IsBoolean()
  @IsOptional()
  @JSONSchema({
    description:
      'Labels the post as AI generated. Video posts only, and only when content_posting_method=DIRECT_POST. TikTok has no AI-generated label for photo posts, and discards it on UPLOAD.',
  })
  video_made_with_ai: boolean;

  @IsBoolean()
  @JSONSchema({
    description:
      '"Your Brand" - the post promotes the creator\'s own brand, and TikTok labels it ' +
      '"Promotional content". Only meaningful when disclose=true. If brand_content_toggle ' +
      'is also true, TikTok labels the post "Paid partnership" instead. Ignored by TikTok ' +
      'on UPLOAD.',
  })
  brand_organic_toggle: boolean;

  @IsIn(['DIRECT_POST', 'UPLOAD'])
  @IsString()
  @JSONSchema({
    description:
      'Required. Use "DIRECT_POST" to actually publish the post to TikTok. ' +
      '"UPLOAD" does NOT publish: it only sends the media to the user\'s TikTok app inbox, ' +
      'where they must manually finish and publish it within 24 hours or it is discarded, ' +
      'and it makes TikTok ignore every other setting here. ' +
      'Only use "UPLOAD" when the user explicitly asks to review or edit the post inside the TikTok app before publishing.',
  })
  content_posting_method: 'DIRECT_POST' | 'UPLOAD';
}
