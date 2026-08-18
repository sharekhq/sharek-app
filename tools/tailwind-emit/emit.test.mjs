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
