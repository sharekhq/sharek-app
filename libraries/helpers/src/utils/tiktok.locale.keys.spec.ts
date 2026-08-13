// Guards the TikTok composer's new strings (en + ar). A key that exists only
// as an inline t() default renders English in every other language, which is
// how the fork's "half-translated Arabic" bug happened — and the
// duplicate-key spec does not catch it, because it never compares one locale
// against another.
// (feature 012-tiktok-ux-compliance.)
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(
  __dirname,
  '../../../react-shared-libraries/src/translation/locales'
);

const readLocale = (lng: string) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES_DIR, lng, 'translation.json'), 'utf8')
  ) as Record<string, string>;

describe('TikTok composer locale keys', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');

  it.each([
    // US1 — commercial content disclosure
    'tiktok_label_promotional_photo',
    'tiktok_label_promotional_video',
    'tiktok_label_paid_partnership_photo',
    'tiktok_label_paid_partnership_video',
    'tiktok_branded_content_not_private',
    'tiktok_disclosure_needs_a_choice',
    // US2 — settings that match the account
    'tiktok_creator_info_unavailable',
    // US3 — told before posting when TikTok will refuse
    'tiktok_posting_to_account',
    'tiktok_refusal_daily_post_limit',
    'tiktok_refusal_account_banned',
    'tiktok_refusal_app_quota',
    'tiktok_refusal_generic',
    'tiktok_video_too_long',
    // US4 — what happens after publishing
    'tiktok_processing_delay_notice',
  ])('has a non-empty English and Arabic %s', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
  });

  it.each([
    ['tiktok_posting_to_account', '{{nickname}}'],
    ['tiktok_video_too_long', '{{maximum}}'],
  ])('keeps the %s placeholder in both locales', (key, placeholder) => {
    expect(en[key]).toContain(placeholder);
    expect(ar[key]).toContain(placeholder);
  });

  it('keeps "Sharek" in Latin script in the Arabic quota message', () => {
    // The brand name is never transliterated, and this message exists
    // precisely to say whose quota was exhausted.
    expect(ar.tiktok_refusal_app_quota).toContain('Sharek');
  });

  it('quotes TikTok’s mandated sentences verbatim in English', () => {
    // TikTok rejects applications that paraphrase the sentences in its
    // Content Sharing Guidelines, so these two are wording, not copy.
    expect(en.tiktok_disclosure_needs_a_choice).toBe(
      'You need to indicate if your content promotes yourself, a third party, or both.'
    );
    expect(en.tiktok_branded_content_not_private).toBe(
      'Branded content visibility cannot be set to private.'
    );
  });

  it.each([
    ['tiktok_label_promotional_photo', "Your photo will be labeled as 'Promotional content'"],
    ['tiktok_label_promotional_video', "Your video will be labeled as 'Promotional content'"],
    ['tiktok_label_paid_partnership_photo', "Your photo will be labeled as 'Paid partnership'"],
    ['tiktok_label_paid_partnership_video', "Your video will be labeled as 'Paid partnership'"],
  ])('quotes the %s label prompt exactly as TikTok writes it', (key, sentence) => {
    // Down to the punctuation: TikTok prescribes single quotes around the
    // label name, and a side-by-side read against the published guidelines is
    // the only thing that catches a swap to double quotes.
    expect(en[key]).toBe(sentence);
  });
});
