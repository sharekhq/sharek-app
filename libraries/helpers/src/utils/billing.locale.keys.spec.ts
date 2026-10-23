// Guards the billing surfaces, the way developers.locale.keys.spec.ts guards Settings › Developers:
// a key that exists only as an inline t() default renders English in Arabic, and upstream ships
// the account-deletion and downgrade texts exactly that way.
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
const en = readLocale('en');
const ar = readLocale('ar');

const SURFACES = [
  'billing/main.billing.component.tsx',
  'billing/billing.history.component.tsx',
  'billing/first.billing.component.tsx',
  'billing/finish.trial.tsx',
  'billing/use.payment.action.tsx',
  'layout/invoices.component.tsx',
  'layout/layout.context.tsx',
  'layout/pre-condition.component.tsx',
  'settings/delete-account.component.tsx',
].map((file) =>
  path.join(__dirname, '../../../../apps/frontend/src/components', file)
);

describe('billing surfaces — every string they render', () => {
  const source = SURFACES.map((file) => fs.readFileSync(file, 'utf8')).join(
    '\n'
  );
  // Read off the components, not listed: a list cannot catch the next inline-default-only key.
  const referenced = Array.from(
    new Set(
      Array.from(
        source.matchAll(
          /(?:\bi18next\.t|(?<![A-Za-z0-9_$.])t)\(\s*['"]([A-Za-z0-9_]+)['"]/g
        ),
        (match) => match[1]
      )
    )
  ).sort();

  it('finds the keys at all — a regex matching nothing would pass everything', () => {
    expect(referenced.length).toBeGreaterThan(100);
    expect(referenced).toContain('billing_and_subscription');
    expect(referenced).toContain('delete_account_confirm_subscription_members');
    expect(referenced).toContain('billing_team_members_will_be_disabled');
  });

  it.each(referenced)('says %s in both languages', (key) => {
    expect(typeof en[key]).toBe('string');
    expect(en[key].length).toBeGreaterThan(0);
    expect(typeof ar[key]).toBe('string');
    expect(ar[key].length).toBeGreaterThan(0);
    // Identical bytes in both locales means the English was copied, not translated.
    expect(ar[key]).not.toBe(en[key]);
    // A placeholder missing from one side renders braces or drops the value.
    const names = (value: string) =>
      Array.from(value.matchAll(/{{\s*(\w+)\s*}}/g), (m) => m[1]).sort();
    expect(names(ar[key])).toEqual(names(en[key]));
  });
});

describe('billing Arabic, in Sharek style', () => {
  const STEP_KEYS = Object.keys(ar).filter((key) =>
    /^(billing_(cycle|renews_on|trial_ends_on|ai_credits_reset_monthly|ai_images|ai_videos|clipping_minutes|and_subscription|and_subscription_description|current_plan|upgrade|downgrade|downgrade_on|switch_to_yearly|switch_to_monthly|purchase|payment_method|payment_method_description|update_payment_method|history|search|all_statuses|export|plan|amount|purchase_date|end_date|status|action|invoice|status_paid|status_open|status_failed|status_void|download_invoice|view_invoice|no_matching_invoices|no_invoices|team_members_will_be_disabled)|finish_trial(_\w+)?|delete_account_confirm_\w+|no_keep_subscription)$/.test(
      key
    )
  );

  it('covers the step’s new keys', () => {
    expect(STEP_KEYS.length).toBe(48);
  });

  // The 20% sits at the end of the badge, where a percent sign takes the paragraph's direction;
  // a left-to-right mark before the number keeps "20%". Invisible in the JSON, so pinned here.
  it('keeps "20%" in reading order in the discount badge', () => {
    expect(ar.billing_20_percent_off).toBe('خصم ‎20%');
  });

  it.each(STEP_KEYS)('%s carries no mark but tanween fath', (key) => {
    expect(ar[key]).not.toMatch(/[ٌ-ْ]/);
  });

  it.each(STEP_KEYS)('%s says رفع/تنزيل, never تحميل', (key) => {
    expect(ar[key]).not.toContain('تحميل');
  });

  // upstream's ar side declares a second billing_unlimited_team_members; JSON keeps the last one
  it("keeps one billing_unlimited_team_members, the marketing site's", () => {
    const raw = fs.readFileSync(
      path.join(LOCALES_DIR, 'ar', 'translation.json'),
      'utf8'
    );
    expect(raw.match(/"billing_unlimited_team_members":/g)).toHaveLength(1);
    expect(ar.billing_unlimited_team_members).toBe('أعضاء فريق بلا حدود');
  });
});

// Sharek's own keys whose wording upstream's billing texts replace (en and ar only).
describe('keys the step orphans', () => {
  it.each([
    'current_plan',
    'purchase',
    'downgrade_on',
    'your_team_members_will_be_removed_from_your_organization',
    'close_window',
    'close_dialog',
  ])('%s is gone from en and ar', (key) => {
    expect({ key, en: key in en, ar: key in ar }).toEqual({
      key,
      en: false,
      ar: false,
    });
  });
});
