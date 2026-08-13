// TikTok's Content Sharing Guidelines make two combinations unpublishable, and
// rejected the application once for allowing them (feature
// 012-tiktok-ux-compliance). Both rules live here rather than in the composer
// so that the public API and the AI assistant inherit them — the composer's
// disabled publish control is the visible layer, not the boundary.
//
// The sentences below are TikTok's own and are written out in full rather than
// imported from the DTO: TikTok rejects paraphrase, so the wording itself is
// what these tests exist to pin.
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TikTokDto } from './tiktok.dto';

const DISCLOSURE_NEEDS_A_CHOICE =
  'You need to indicate if your content promotes yourself, a third party, or both.';
const BRANDED_CONTENT_IS_NEVER_PRIVATE =
  'Branded content visibility cannot be set to private.';

// Mirrors how posts.service.ts validates a provider's settings, options
// included, so these assertions describe the behaviour on the real route.
const messages = (settings: Record<string, unknown>): string[] =>
  validateSync(
    plainToInstance(TikTokDto, settings, { enableImplicitConversion: false }),
    { skipMissingProperties: false }
  ).flatMap((error) => Object.values(error.constraints ?? {}));

const directPost = {
  privacy_level: 'PUBLIC_TO_EVERYONE',
  duet: false,
  stitch: false,
  comment: false,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  disclose: false,
  content_posting_method: 'DIRECT_POST',
};

describe('TikTokDto — disclosure needs a choice', () => {
  it("refuses a disclosed post with neither commercial option, in TikTok's own words", () => {
    expect(messages({ ...directPost, disclose: true })).toContain(
      DISCLOSURE_NEEDS_A_CHOICE
    );
  });

  it('accepts "Your Brand" alone', () => {
    expect(
      messages({ ...directPost, disclose: true, brand_organic_toggle: true })
    ).not.toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });

  it('accepts "Branded Content" alone', () => {
    expect(
      messages({ ...directPost, disclose: true, brand_content_toggle: true })
    ).not.toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });

  it('accepts both options together', () => {
    expect(
      messages({
        ...directPost,
        disclose: true,
        brand_organic_toggle: true,
        brand_content_toggle: true,
      })
    ).not.toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });

  it('does not ask for a choice when disclosure is off', () => {
    expect(messages(directPost)).not.toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });

  it('does not apply when the media is sent to the TikTok inbox', () => {
    // TikTok discards the disclosure fields on UPLOAD, so refusing the post
    // would block an upload TikTok would happily accept.
    expect(
      messages({
        ...directPost,
        disclose: true,
        content_posting_method: 'UPLOAD',
      })
    ).not.toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });
});

describe('TikTokDto — branded content is never private', () => {
  it("refuses branded content set to private, in TikTok's own words", () => {
    expect(
      messages({
        ...directPost,
        disclose: true,
        brand_content_toggle: true,
        privacy_level: 'SELF_ONLY',
      })
    ).toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it.each([
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
  ])('accepts branded content set to %s', (privacy_level) => {
    expect(
      messages({
        ...directPost,
        disclose: true,
        brand_content_toggle: true,
        privacy_level,
      })
    ).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('leaves private visibility alone when the post is not branded content', () => {
    expect(
      messages({ ...directPost, privacy_level: 'SELF_ONLY' })
    ).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('does not restrict visibility when the post is only promoting your own brand', () => {
    expect(
      messages({
        ...directPost,
        disclose: true,
        brand_organic_toggle: true,
        privacy_level: 'SELF_ONLY',
      })
    ).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });

  it('does not apply when the media is sent to the TikTok inbox', () => {
    expect(
      messages({
        ...directPost,
        disclose: true,
        brand_content_toggle: true,
        privacy_level: 'SELF_ONLY',
        content_posting_method: 'UPLOAD',
      })
    ).not.toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });
});

describe('TikTokDto — a visibility must be chosen', () => {
  // TikTok forbids pre-selecting a visibility, so the interface supplies no
  // default and the settings class is what stops an unanswered post.
  const withoutVisibility = () => {
    const { privacy_level, ...rest } = directPost;
    return rest;
  };
  const refusedVisibility = (settings: Record<string, unknown>) =>
    messages(settings).some((message) => message.includes('privacy_level'));

  it('refuses a direct post with no visibility chosen', () => {
    expect(refusedVisibility(withoutVisibility())).toBe(true);
  });

  it('accepts a direct post once a visibility is chosen', () => {
    expect(refusedVisibility(directPost)).toBe(false);
  });

  it('refuses a visibility TikTok does not recognise', () => {
    expect(
      refusedVisibility({ ...directPost, privacy_level: 'EVERYONE' })
    ).toBe(true);
  });

  it('does not require one when the media is sent to the TikTok inbox', () => {
    // TikTok discards the visibility on UPLOAD, so demanding one would block an
    // upload it would otherwise accept.
    expect(
      refusedVisibility({
        ...withoutVisibility(),
        content_posting_method: 'UPLOAD',
      })
    ).toBe(false);
  });
});

describe('TikTokDto — the constraints are total', () => {
  // posts.service.ts validates every selected provider inside one Promise.all.
  // A constraint that throws on a half-filled object would fail validation for
  // every other channel in the post, not just TikTok.
  it.each([
    ['an empty object', {}],
    ['disclosure alone', { disclose: true }],
    ['branded content alone', { brand_content_toggle: true }],
    ['a null settings body', { disclose: null, brand_content_toggle: null }],
    [
      'the toggles present but undefined',
      {
        disclose: true,
        brand_organic_toggle: undefined,
        brand_content_toggle: undefined,
        privacy_level: undefined,
        content_posting_method: undefined,
      },
    ],
  ])('returns errors rather than throwing for %s', (_label, settings) => {
    expect(() => messages(settings as Record<string, unknown>)).not.toThrow();
  });

  it('still refuses a half-filled disclosed post rather than passing it', () => {
    // Absent a posting method the post is a direct post, which is what the
    // interface sends; the rule has to hold there too.
    expect(messages({ disclose: true })).toContain(DISCLOSURE_NEEDS_A_CHOICE);
  });

  it('still refuses a half-filled branded private post rather than passing it', () => {
    expect(
      messages({ brand_content_toggle: true, privacy_level: 'SELF_ONLY' })
    ).toContain(BRANDED_CONTENT_IS_NEVER_PRIVATE);
  });
});
