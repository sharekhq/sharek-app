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

const PANEL = path.join(
  __dirname,
  '../../../../apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx'
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
    // US1 — the section's own copy, neutral rather than video-specific
    'tiktok_content_disclosure',
    'tiktok_disclosure_description',
    'tiktok_your_brand_description',
    'tiktok_brand_organic_classification',
    'tiktok_branded_content_classification',
    'tiktok_label_cannot_be_changed',
    'tiktok_who_can_see_this_post',
    'tiktok_auto_add_music_description',
    // US2 — settings that match the account
    'tiktok_creator_info_unavailable',
    'tiktok_visibility_needs_a_choice',
    // US3 — told before posting when TikTok will refuse
    'tiktok_posting_to_account',
    'tiktok_refusal_daily_post_limit',
    'tiktok_refusal_account_banned',
    'tiktok_refusal_app_quota',
    'tiktok_refusal_generic',
    'tiktok_video_too_long',
    // US4 — what happens after publishing
    'tiktok_processing_delay_notice',
    // 013 US4 — where an inbox upload turns up
    'tiktok_upload_inbox_notice',
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

  it('spells the inbox notice correctly in English', () => {
    // It read "you fill find" on the panel a TikTok reviewer inspects.
    expect(en.tiktok_upload_inbox_notice).toContain('you will find');
    expect(en.tiktok_upload_inbox_notice).not.toContain('fill find');
  });

  it('keeps the photo-post title label translated', () => {
    // Nothing in the panel calls t() for this one: `Input` translates its own
    // label through the key TranslatedLabel derives from it. So the fork's
    // usual "no t() means English" heuristic misreads it — it renders العنوان
    // today — and this assertion is the only thing between that label and a
    // silent English render if the key is ever dropped.
    expect(typeof en.label_title).toBe('string');
    expect(en.label_title.length).toBeGreaterThan(0);
    expect(typeof ar.label_title).toBe('string');
    expect(ar.label_title.length).toBeGreaterThan(0);
  });
});

describe('TikTok composer — every string the panel renders', () => {
  const en = readLocale('en');
  const ar = readLocale('ar');
  const panel = fs.readFileSync(PANEL, 'utf8');

  // Read off the panel rather than listed here on purpose: a hardcoded list
  // cannot catch the next key that ships as an inline t() default only, which
  // is how an Arabic reader ends up looking at English.
  const referenced = Array.from(
    new Set([
      ...Array.from(
        panel.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*'([A-Za-z0-9_]+)'/g),
        (match) => match[1]
      ),
      // A bare label prop is translated by the input itself, through the key
      // TranslatedLabel derives when none is passed.
      ...Array.from(
        panel.matchAll(/\blabel="([^"]+)"/g),
        (match) =>
          `label_${match[1]
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^\w]/g, '')}`
      ),
    ])
  ).sort();

  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(referenced.length).toBeGreaterThan(40);
    expect(referenced).toContain('tiktok_branded_content_not_private');
    expect(referenced).toContain('label_title');
  });

  it.each(referenced)('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    // Identical bytes in both locales means the English was copied across
    // rather than translated, which reads as done and is not.
    expect(ar[key]).not.toBe(en[key]);
  });
});
