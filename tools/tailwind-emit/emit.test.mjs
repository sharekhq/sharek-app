// Tests that the class forms this feature depends on actually emit CSS. Run
// them with:
//
//   node --test 'tools/tailwind-emit/*.test.mjs'
//
// Node's built-in runner, matching tools/responsive-probe. Pass the glob, not
// the directory: since Node 22.6 a positional is a glob pattern, and a bare
// directory matches nothing.
//
// Why this exists. A mistyped Tailwind variant does not fail — it emits
// nothing, silently, and the page looks exactly as it did. `coarse:` is
// registered by hand at tailwind.config.cjs:263 and is not `pointer-coarse:`;
// `mobile:` is a raw screen, and the calendar's whole layout change rests on a
// `mobile:` variant of an *arbitrary property*, the one form most likely to be
// dropped. Asserting the emitted CSS is the only way to see any of that.
//
// The expectations below are specs/016-responsive-primitives/quickstart.md
// step 1, which is R4's assertion promoted to a checked-in fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

// The five forms, and the one declaration each must produce inside the one
// at-rule each must sit in. `params` is matched after collapsing whitespace,
// because Tailwind's own spacing inside a media query is not the contract.
const FORMS = [
  {
    className: 'mobile:sticky',
    atRule: '(max-width: 1025px)',
    prop: 'position',
    value: 'sticky',
  },
  {
    // Logical, not `left` — see the dir-scoped test below for the rest of the
    // story, because this is not the only rule `start-0` ships.
    className: 'mobile:start-0',
    atRule: '(max-width: 1025px)',
    prop: 'inset-inline-start',
    value: '0px',
  },
  {
    className: 'mobile:[grid-template-columns:44px_repeat(7,_minmax(58px,_1fr))]',
    atRule: '(max-width: 1025px)',
    prop: 'grid-template-columns',
    value: '44px repeat(7, minmax(58px, 1fr))',
  },
  {
    className: 'coarse:min-h-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'min-height',
    value: '44px',
  },
  {
    className: 'coarse:min-w-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'min-width',
    value: '44px',
  },
  {
    // The modal's floor, which has to yield to a narrower viewport. A minimum
    // is the one clamp CSS applies last, so it cannot be capped from outside
    // by a max-width — the yielding has to happen inside the value, and an
    // arbitrary value carrying a comma is the form most likely to be dropped.
    className: 'min-w-[min(600px,100%)]',
    atRule: null,
    prop: 'min-width',
    value: 'min(600px,100%)',
  },
  {
    // The touch floor on a control whose height is already declared: a
    // `min-height` would lose to it, so the coarse rule has to set `height`.
    className: 'coarse:h-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'height',
    value: '44px',
  },
  {
    // TT2 — 16px is the size below which iOS Safari zooms a focused field.
    // Arbitrary font sizes emit no paired line-height, which is why this is
    // asserted as exactly one declaration.
    className: 'coarse:text-[16px]',
    atRule: '(pointer: coarse)',
    prop: 'font-size',
    value: '16px',
  },
  {
    // TT8's reveal. A control kept `hidden` until hover has to be shown
    // outright where there is no hover — which works only because the coarse
    // rule is emitted after the `hidden` it has to beat, asserted separately
    // below. Two classes at the same specificity are decided by order alone.
    className: 'coarse:block',
    atRule: '(pointer: coarse)',
    prop: 'display',
    value: 'block',
  },
  {
    // Its counterpart: where a reveal takes a row's space, whatever the row
    // showed instead has to give it up under the same pointer.
    className: 'coarse:hidden',
    atRule: '(pointer: coarse)',
    prop: 'display',
    value: 'none',
  },
  {
    className: 'coarse:opacity-100',
    atRule: '(pointer: coarse)',
    prop: 'opacity',
    value: '1',
  },
  {
    // Revealing an `opacity-0` control is only half of it. The ones hanging
    // over a media tile are `pointer-events-none` as well, and a control that
    // is visible but cannot be tapped is worse than one that is hidden.
    className: 'coarse:pointer-events-auto',
    atRule: '(pointer: coarse)',
    prop: 'pointer-events',
    value: 'auto',
  },
];

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Every declaration Tailwind emitted for `className` *on its own*, paired with
// the media query it landed in. Selectors are compared by their unescaped
// class, so the test never has to spell `\2c ` or `\[` and stays readable.
//
// Rules where the class is qualified by something else — `[dir="rtl"] .x` — are
// deliberately not counted here. They are a different claim and get their own
// test; folding them in would make every assertion below depend on which
// plugins happen to be installed.
function emitted(css, className, { qualifier = null } = {}) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    const classes = rule.selector
      .split(',')
      .map((sel) => sel.trim())
      .filter((sel) => (qualifier ? sel.startsWith(`${qualifier} .`) : sel.startsWith('.')))
      .map((sel) => sel.slice(qualifier ? qualifier.length + 2 : 1))
      .map((sel) => sel.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)));
    if (!classes.includes(className)) return;
    const atRule = rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null;
    rule.walkDecls((decl) => found.push({ atRule, prop: decl.prop, value: collapse(decl.value) }));
  });
  return found;
}

test('every class form this feature depends on emits CSS', async () => {
  const css = await emit(FORMS.map((f) => f.className));

  for (const form of FORMS) {
    const decls = emitted(css, form.className);

    // The failure this file exists for: a variant that emits nothing at all.
    assert.ok(
      decls.length > 0,
      `${form.className} emitted no CSS — the variant or the arbitrary value was dropped, not applied`
    );

    assert.deepEqual(
      decls,
      [{ atRule: form.atRule, prop: form.prop, value: form.value }],
      `${form.className} did not emit exactly ${form.prop}: ${form.value} inside @media ${form.atRule}`
    );
  }
});

test('start-0 also ships the physical pair tailwindcss-rtl adds, and they agree with the logical one', async () => {
  // The plugin emits `[dir="ltr"] .x { left: 0 }` and `[dir="rtl"] .x { right: 0 }`
  // alongside the logical property, and those win on specificity wherever the
  // document declares a direction. That is not a problem — all three resolve to
  // the inline-start edge — but "one logical rule and nothing else" was wrong,
  // and a fixture that quietly filtered them out would keep saying so.
  const css = await emit(['mobile:start-0']);

  assert.deepEqual(emitted(css, 'mobile:start-0', { qualifier: '[dir="ltr"]' }), [
    { atRule: '(max-width: 1025px)', prop: 'left', value: '0px' },
  ]);
  assert.deepEqual(emitted(css, 'mobile:start-0', { qualifier: '[dir="rtl"]' }), [
    { atRule: '(max-width: 1025px)', prop: 'right', value: '0px' },
  ]);
});

test('a variant that does not exist emits nothing, so the assertions above can fail', async () => {
  // The control. `pointer-coarse:` is the plausible misspelling of the
  // hand-registered `coarse:` variant — proof that emitted-CSS assertions
  // distinguish a working class from a silently dropped one.
  const css = await emit(['pointer-coarse:min-h-[44px]']);

  assert.deepEqual(emitted(css, 'pointer-coarse:min-h-[44px]'), []);
});

test('the tap-to-open variant emits, and hangs off the group rather than the panel', async () => {
  // The four hover-revealed *panels* cannot simply be shown under `coarse:` —
  // pinned open, an org list and a heading picker sit over the page for good.
  // They open on focus instead, which a tap gives them, and `focus-within` is
  // what carries a tap on the trigger down to the panel it reveals.
  //
  // The claim worth asserting is where the rule lands: on `.group:focus-within
  // .panel`, not on the panel alone. A rule that emitted on the panel itself
  // would open only while the panel already had focus — which it cannot get
  // while it is closed.
  const css = await emit([
    'group-focus-within:flex',
    'group-focus-within:opacity-100',
    'group-focus-within:pointer-events-auto',
  ]);

  const underGroup = (className) => emitted(css, className, { qualifier: '.group:focus-within' });

  assert.deepEqual(underGroup('group-focus-within:flex'), [
    { atRule: null, prop: 'display', value: 'flex' },
  ]);
  assert.deepEqual(underGroup('group-focus-within:opacity-100'), [
    { atRule: null, prop: 'opacity', value: '1' },
  ]);
  assert.deepEqual(underGroup('group-focus-within:pointer-events-auto'), [
    { atRule: null, prop: 'pointer-events', value: 'auto' },
  ]);

  // Nothing on the bare class: the whole rule is the descendant one above.
  assert.deepEqual(emitted(css, 'group-focus-within:flex'), []);
});

test('a coarse reveal is emitted after the base utility it has to beat', async () => {
  // `hidden coarse:block` on one element is two rules of equal specificity, so
  // the later one wins and order is the entire mechanism. It happens to hold
  // for every pair phase 6 relies on — but it holds because Tailwind emits
  // variants after plain utilities, not because anyone chose it, and a change
  // in that order would un-reveal every one of these controls silently.
  const pairs = [
    ['hidden', 'coarse:block'],
    ['block', 'coarse:hidden'],
    ['opacity-0', 'coarse:opacity-100'],
    ['pointer-events-none', 'coarse:pointer-events-auto'],
    ['group-hover:block', 'coarse:block'],
  ];

  const css = await emit([...new Set(pairs.flat())]);
  const order = [];
  postcss.parse(css).walkRules((rule) => {
    order.push(
      rule.selector
        .replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch))
        .replace(/^\.group:hover /, '')
        .slice(1)
    );
  });

  for (const [base, override] of pairs) {
    assert.ok(
      order.indexOf(base) < order.indexOf(override),
      `${override} is emitted before ${base}, so the base utility wins and the control stays hidden under a coarse pointer`
    );
  }
});

test('a screen variant outranks the pointer variant, which is why the touch floor sometimes has to stack', async () => {
  // Both variants are media queries, so neither wins on specificity — the one
  // emitted later does. Tailwind puts the hand-registered `coarse` variant
  // *before* the screens, so `phone:min-w-0` beats `coarse:min-w-[44px]` at
  // exactly the width where a control is most likely to be too small to hit.
  // Anywhere that matters, the rule is written `phone:coarse:`, and this test
  // is what says that is still necessary.
  const css = await emit(['coarse:min-w-[44px]', 'phone:min-w-0', 'phone:coarse:min-w-[44px]']);
  const order = [];
  postcss.parse(css).walkRules((rule) => {
    const cls = rule.selector.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)).slice(1);
    order.push(cls);
  });

  assert.deepEqual(order, [
    'coarse:min-w-[44px]',
    'phone:min-w-0',
    'phone:coarse:min-w-[44px]',
  ]);
});
