// 058 — brands from the channel list. The post card's tag names
// (launches/calendar.post.card.tsx), which hide under the pointer keeping
// their space. A variant or arbitrary value that Tailwind can't use emits
// nothing and the page just doesn't change, so this file asserts what Tailwind
// emitted for each of them, with the project's own config (see emit.mjs). Each
// phase adds its own describe.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const unescape = (s) =>
  s.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch
  );

// Where a class name may end inside a selector: the selector's end, a pseudo
// (`:hover`, `::-webkit-scrollbar`), a combinator or the end of a selector
// list. So `phone:flex` doesn't also find `phone:flex-row`.
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
// unescaped selector, the at-rule it sits in, and its declarations as
// [property, value] pairs.
function rules(css, className) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    const selector = unescape(rule.selector);
    if (!names(selector, className)) return;
    const decls = [];
    rule.walkDecls((d) => decls.push([d.prop, collapse(d.value)]));
    found.push({
      selector,
      atRule:
        rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null,
      decls,
    });
  });
  return found;
}

// Asserts each class emitted, every rule it emitted sits in `atRule` (null:
// outside any query), and each rule declares exactly what the table says.
async function assertEmits(table, atRule) {
  const css = await emit(Object.keys(table));
  for (const [className, decls] of Object.entries(table)) {
    const found = rules(css, className);
    assert.ok(
      found.length > 0,
      `${className} emitted no CSS — the variant or the value was dropped`
    );
    for (const rule of found) {
      assert.equal(
        rule.atRule,
        atRule,
        `${className} emitted "${rule.selector}" under ${rule.atRule}`
      );
      assert.deepEqual(
        rule.decls,
        decls,
        `${className} emitted the wrong rule`
      );
    }
  }
  return css;
}

describe("The post card's tag names (phase 3)", () => {
  test('hide under the pointer over the card keeping their space, outside any query', async () => {
    const css = await assertEmits(
      { 'group-hover:invisible': [['visibility', 'hidden']] },
      null
    );
    assert.deepEqual(
      rules(css, 'group-hover:invisible').map((r) => r.selector),
      ['.group:hover .group-hover:invisible']
    );
  });
});
