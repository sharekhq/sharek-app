// Guards the paywall's direction-sensitive layout, the way the locale specs
// guard its strings: by reading the component rather than rendering it, because
// FirstBillingComponent pulls in SWR, Stripe and the user context and none of
// that is what the claim is about.
//
// The bug this exists for: the two-column divider was `border-l` on an element
// whose padding was already logical (`ps-[40px]`). In English the two agree, so
// nothing looks wrong. Under `dir="rtl"` the flex order reverses and the padding
// follows it while a physical border does not, so the line detaches from the gap
// it marks and lands against the outer edge of the viewport.
import * as fs from 'fs';
import * as path from 'path';

const PAYWALL = path.join(
  __dirname,
  '../../../../apps/frontend/src/components/billing/first.billing.component.tsx'
);

const source = fs.readFileSync(PAYWALL, 'utf8');

// Only what ends up on an element. Scanning the raw file would read the prose
// too, and the comment explaining this very fix names the class it replaced —
// a guard that fails on its own rationale is worse than no guard.
const classNames = Array.from(
  source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{clsx\(([\s\S]*?)\)\})/g),
  (match) => match[1] || match[2] || match[3] || ''
);
const allClasses = classNames.join(' ');

describe('paywall column divider', () => {
  it('finds the classNames at all — a scan matching nothing would pass everything', () => {
    expect(classNames.length).toBeGreaterThan(20);
    expect(allClasses).toContain('border-newColColor');
  });

  // `border-s` is `border-inline-start-width`, which follows the same axis as
  // the `ps-` beside it. tools/tailwind-emit asserts that separately.
  it('marks the column gap with a logical border', () => {
    expect(allClasses).toMatch(/\bborder-s\b/);
  });

  it('puts no physical left or right border on any element', () => {
    const physical = allClasses.match(/\bborder-[lr]\b/g) || [];
    expect(physical).toEqual([]);
  });

  // The padding was already logical; the point is that the pair stays together,
  // since it is the disagreement between them that produced the bug.
  it('keeps the divider padding logical too', () => {
    expect(allClasses).toMatch(/\bps-\[40px\]/);
    expect(allClasses).not.toMatch(/\bpl-\[40px\]/);
  });
});
