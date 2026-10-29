// 045 — the small-screen shell. The app shell, its drawer, the notifications
// popup and the laid-out modal shell take their small-screen geometry at
// Tailwind's `mobile` screen (max-width 1025px) instead of `phone` (768px), and
// the Time Table's touch floors sit under `coarse:`. Every one of those classes
// fails silently if it is dropped, so this file asserts what Tailwind emitted
// for them, with the project's own config (see emit.mjs).
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
//
// The facts here are the plan's "Verified Tailwind behaviour"
// (specs/045-small-screen-shell/plan.md); they are what the class strings in
// layout.component.tsx, notification.component.tsx, new-modal.tsx and
// time.table.tsx rely on. The last section pins the current menu item's
// colour tokens (colors.scss) that menu-item.tsx uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import postcss from 'postcss';

import { emit } from './emit.mjs';

const MOBILE = '(max-width: 1025px)';
const COARSE = '(pointer: coarse)';

// Every `mobile:` class the shell, the popup and the modal shell carry.
const SHELL_MOBILE = [
  // layout.component.tsx — page wrapper, reserve column, scrim, drawer
  'mobile:py-[8px]',
  'mobile:pe-[8px]',
  'mobile:min-h-dvh',
  'mobile:hidden',
  'mobile:block',
  'mobile:start-0',
  'mobile:w-[100px]',
  'mobile:px-[8px]',
  'mobile:z-[190]',
  'mobile:bg-newBgColor',
  'mobile:transition-transform',
  'mobile:duration-300',
  'mobile:ease-out',
  'mobile:translate-x-0',
  'mobile:-translate-x-full',
  'mobile:rtl:translate-x-full',
  // header, menu button, title, icon group
  'mobile:h-[64px]',
  'mobile:px-[12px]',
  'mobile:gap-[12px]',
  'mobile:flex',
  'mobile:text-[18px]',
  'mobile:gap-[14px]',
  'mobile:items-center',
  // notification.component.tsx — popup and bell wrapper
  'mobile:mt-0',
  'mobile:w-auto',
  'mobile:start-[8px]',
  'mobile:!end-[8px]',
  'mobile:static',
  // new-modal.tsx — column, card, title, close box
  'mobile:pt-[24px]',
  'mobile:pb-[24px]',
  'mobile:h-dvh',
  'mobile:p-[16px]',
  'mobile:rounded-[16px]',
  'mobile:w-full',
  'mobile:text-[20px]',
  'mobile:pe-[28px]',
  'mobile:end-0',
  'mobile:top-0',
  'mobile:min-w-[44px]',
  'mobile:min-h-[44px]',
  'mobile:justify-center',
];

// time.table.tsx — Add and the trash button on a coarse pointer.
const TIME_TABLE_COARSE = [
  'coarse:h-[44px]',
  'coarse:min-w-[44px]',
  'coarse:min-h-[44px]',
  'coarse:-me-[6px]',
  'coarse:flex',
  'coarse:items-center',
  'coarse:justify-center',
];

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const unescape = (s) =>
  s.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch
  );

// Where a class name may end inside a selector: the selector's end, a pseudo
// (`:where(…)` for `rtl:`), a combinator or the end of a selector list.
const ENDS = new Set([undefined, ':', ' ', ',', ')']);

const names = (selector, className) => {
  const needle = `.${className}`;
  for (let at = selector.indexOf(needle); at !== -1; ) {
    if (ENDS.has(selector[at + needle.length])) return true;
    at = selector.indexOf(needle, at + 1);
  }
  return false;
};

// Every rule that names `className`, in the order Tailwind emitted them: its
// unescaped selector (so `[dir="rtl"] .x` stays visible), the at-rule it sits
// in, and its declarations.
function rules(css, className) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    const selector = unescape(rule.selector);
    if (!names(selector, className)) return;
    const decls = [];
    rule.walkDecls((d) =>
      decls.push({
        prop: d.prop,
        value: collapse(d.value),
        important: d.important === true,
      })
    );
    found.push({
      selector,
      atRule:
        rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null,
      decls,
    });
  });
  return found;
}

// The emission order of every rule, as [selector, at-rule] pairs.
function order(css) {
  const out = [];
  postcss.parse(css).walkRules((rule) =>
    out.push({
      selector: unescape(rule.selector),
      atRule:
        rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null,
    })
  );
  return out;
}

test('every mobile: class of the shell emits, and only inside the mobile screen', async () => {
  const css = await emit(SHELL_MOBILE);
  for (const className of SHELL_MOBILE) {
    const found = rules(css, className);
    assert.ok(
      found.length > 0,
      `${className} emitted no CSS — the variant or the value was dropped`
    );
    for (const rule of found) {
      assert.equal(
        rule.atRule,
        MOBILE,
        `${className} emitted "${rule.selector}" outside @media ${MOBILE}`
      );
    }
  }
});

test("the Time Table's touch floors emit, and only under a coarse pointer", async () => {
  const css = await emit(TIME_TABLE_COARSE);
  for (const className of TIME_TABLE_COARSE) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    for (const rule of found) {
      assert.equal(
        rule.atRule,
        COARSE,
        `${className} emitted "${rule.selector}" outside @media ${COARSE}`
      );
    }
  }
  // Pinned by value: a touch floor that emitted the wrong size is no floor.
  assert.deepEqual(rules(css, 'coarse:h-[44px]')[0].decls, [
    { prop: 'height', value: '44px', important: false },
  ]);
  assert.deepEqual(rules(css, 'coarse:-me-[6px]')[0].decls, [
    { prop: 'margin-inline-end', value: '-6px', important: false },
  ]);
});

test('coarse: rules are emitted before mobile: rules, so mobile: wins without stacking', async () => {
  // The modal's close box is `coarse:end-[6px] coarse:top-[6px]` on desktop
  // and `mobile:end-0 mobile:top-0` on small screens. Both are media queries at
  // the same specificity, so the later one wins: the flush box holds on a
  // touch screen only because Tailwind puts `coarse` before the screens.
  const css = await emit([
    'coarse:top-[6px]',
    'coarse:end-[6px]',
    'coarse:min-w-[44px]',
    'mobile:top-0',
    'mobile:end-0',
    'mobile:min-w-[44px]',
  ]);
  const all = order(css);
  const lastCoarse = all.map((r) => r.atRule).lastIndexOf(COARSE);
  const firstMobile = all.map((r) => r.atRule).indexOf(MOBILE);
  assert.ok(
    lastCoarse !== -1 && firstMobile !== -1,
    'a fixture emitted nothing'
  );
  assert.ok(
    lastCoarse < firstMobile,
    'a coarse: rule is emitted after a mobile: rule, so the close box keeps its desktop touch offset on small screens'
  );
});

test("the page wrapper's mobile: padding is emitted after the desktop padding it replaces", async () => {
  const css = await emit([
    'py-[12px]',
    'pe-[12px]',
    'mobile:py-[8px]',
    'mobile:pe-[8px]',
  ]);
  const selectors = order(css).map((r) => r.selector);
  for (const [base, override] of [
    ['.py-[12px]', '.mobile:py-[8px]'],
    ['.pe-[12px]', '.mobile:pe-[8px]'],
  ]) {
    assert.ok(
      selectors.indexOf(base) !== -1 && selectors.indexOf(override) !== -1,
      `${base} or ${override} emitted nothing`
    );
    assert.ok(
      selectors.indexOf(base) < selectors.indexOf(override),
      `${override} is emitted before ${base}, so the 12px desktop edge wins on small screens`
    );
  }
});

test('arbitrary start/end/padding/margin values emit only logical properties', async () => {
  const forms = {
    'mobile:start-[8px]': 'inset-inline-start',
    'mobile:!end-[8px]': 'inset-inline-end',
    'mobile:pe-[8px]': 'padding-inline-end',
    'mobile:pe-[28px]': 'padding-inline-end',
    'coarse:-me-[6px]': 'margin-inline-end',
  };
  const css = await emit(Object.keys(forms));
  for (const [className, prop] of Object.entries(forms)) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    for (const rule of found) {
      assert.ok(
        rule.selector.startsWith('.'),
        `${className} emitted a direction-qualified rule "${rule.selector}"`
      );
      assert.deepEqual(
        rule.decls.map((d) => d.prop),
        [prop],
        `${className} emitted something other than ${prop}`
      );
    }
  }
});

test("end-0 ships physical [dir] rules, which is why the popup's mobile end carries !important", async () => {
  // The popup is `end-0` on desktop. tailwindcss-rtl adds `[dir] .end-0 {
  // right|left: 0 }` at 0,2,0 beside the logical rule, and a plain
  // `mobile:end-[8px]` (0,1,0) loses to it: the popup would stay flush with
  // the header's end edge. `!important` is the only way over it from a class.
  const css = await emit(['end-0', 'mobile:!end-[8px]']);
  const physical = rules(css, 'end-0').filter((r) =>
    r.selector.startsWith('[dir=')
  );
  assert.deepEqual(physical.map((r) => [r.selector, r.decls[0].prop]).sort(), [
    ['[dir="ltr"] .end-0', 'right'],
    ['[dir="rtl"] .end-0', 'left'],
  ]);
  assert.deepEqual(rules(css, 'mobile:!end-[8px]')[0].decls, [
    { prop: 'inset-inline-end', value: '8px', important: true },
  ]);
});

test('mobile:end-0 emits the [dir] physical rules too, inside the mobile screen', async () => {
  // So the close box's flush end beats `coarse:end-[6px]` on specificity as
  // well as on order.
  const css = await emit(['mobile:end-0']);
  const physical = rules(css, 'mobile:end-0').filter((r) =>
    r.selector.startsWith('[dir=')
  );
  assert.deepEqual(
    physical.map((r) => [r.selector, r.atRule, r.decls[0].prop]).sort(),
    [
      ['[dir="ltr"] .mobile:end-0', MOBILE, 'right'],
      ['[dir="rtl"] .mobile:end-0', MOBILE, 'left'],
    ]
  );
});

// ---------------------------------------------------------------------------
// The current menu item (FR-013; maintainer's decision 2026-10-28). Light keeps
// the soft brand tint with pomegranate text; dark is a solid pomegranate tile
// with white on it, because dark's --brand-text (#F0708A) is the rose the brand
// rules out. Its focus ring is pomegranate in light and the light ink in dark,
// where a pomegranate ring beside a pomegranate fill would vanish.
// ---------------------------------------------------------------------------
const COLORS = new URL(
  '../../apps/frontend/src/app/colors.scss',
  import.meta.url
);

// Each theme's custom properties, as colors.scss declares them under `.dark`
// and `.light`, and a value with its var() references followed to the end.
function themes() {
  const tokens = { '.dark': {}, '.light': {} };
  postcss.parse(readFileSync(COLORS, 'utf8')).walkRules((rule) => {
    if (rule.selector in tokens)
      rule.walkDecls((d) => {
        tokens[rule.selector][d.prop] = d.value;
      });
  });
  const resolve = (theme, value) =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name) =>
      resolve(theme, tokens[theme][name] ?? `<${name} undefined>`)
    );
  return (theme, name) => resolve(theme, `var(${name})`);
}

test('the current menu item is a pomegranate tile with white in dark, the soft tint in light', () => {
  const value = themes();

  assert.equal(value('.dark', '--selected-bg'), value('.dark', '--brand'));
  assert.equal(value('.dark', '--selected-text').toLowerCase(), '#ffffff');
  assert.equal(value('.dark', '--selected-ring'), value('.dark', '--ink'));

  assert.equal(
    value('.light', '--selected-bg'),
    value('.light', '--brand-soft-2')
  );
  assert.equal(
    value('.light', '--selected-text'),
    value('.light', '--brand-text')
  );
  assert.equal(value('.light', '--selected-ring'), value('.light', '--brand'));

  // No rose: nothing on the dark tile resolves to dark's --brand-text.
  for (const name of ['--selected-bg', '--selected-text', '--selected-ring'])
    assert.notEqual(value('.dark', name), value('.dark', '--brand-text'), name);
});

test('the selected tokens map to Tailwind classes', async () => {
  const css = await emit([
    'bg-selectedBg',
    'text-selectedText',
    'focus-visible:ring-selectedRing',
  ]);
  const decls = (className) => rules(css, className).flatMap((r) => r.decls);

  assert.deepEqual(decls('bg-selectedBg'), [
    {
      prop: 'background-color',
      value: 'var(--selected-bg)',
      important: false,
    },
  ]);
  assert.deepEqual(decls('text-selectedText'), [
    { prop: 'color', value: 'var(--selected-text)', important: false },
  ]);
  assert.deepEqual(decls('focus-visible:ring-selectedRing'), [
    {
      prop: '--tw-ring-color',
      value: 'var(--selected-ring)',
      important: false,
    },
  ]);
});
