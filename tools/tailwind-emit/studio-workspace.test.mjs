// 061 — the Studio workspace, the composer frame and the Post preview fit, in
// three parts. Part 1 fits Post preview's phone-width preview into its column
// (new-launch/preview.fit.tsx) and gives Instagram's slider a box of its
// first slide's shape (new-launch/providers/instagram/instagram.preview.tsx);
// part 2 puts Studio's tools on the workspace frame; part 3 puts AI Image and
// AI Video beside the post in the composer's frame. A variant or arbitrary
// value that Tailwind can't use emits nothing and the page just doesn't
// change, so this file asserts what Tailwind emitted for each of them, with the
// project's own config (see emit.mjs). Each part adds its own describe.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

const RTL = ':where([dir="rtl"], [dir="rtl"] *)';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const unescape = (s) =>
  s.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch
  );

// Where a class name may end inside a selector: the selector's end, a pseudo
// (`:where(…)` for `rtl:`), a combinator or the end of a selector list. So
// `origin-top` doesn't also find `origin-top-left`.
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
// unescaped selector, the at-rule it sits in, its declarations as
// [property, value] pairs, and its place in the sheet.
function rules(css, className) {
  const found = [];
  let index = 0;
  postcss.parse(css).walkRules((rule) => {
    index += 1;
    const selector = unescape(rule.selector);
    if (!names(selector, className)) return;
    const decls = [];
    rule.walkDecls((d) => decls.push([d.prop, collapse(d.value)]));
    found.push({
      selector,
      atRule:
        rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null,
      decls,
      index,
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

// PreviewFit's three boxes: the room (h-full), the sizer (relative mx-auto)
// and the content box (absolute top-0 start-0, with the origin below), and
// Instagram's box around the slider (w-full rounded-[8px] overflow-hidden,
// the slider h-full). h-full, relative and absolute are channel-panels'
// order cases; top-0, start-0 and rounded-[8px] are asserted in
// media-library and others.
describe('Part 1: the preview fit', () => {
  test("the sizer's and Instagram's box's own forms emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the sizer, centred in Post preview's column
        'mx-auto': [
          ['margin-left', 'auto'],
          ['margin-right', 'auto'],
        ],
        // Instagram's box, the column's width, its slides clipped at its
        // rounded corners
        'w-full': [['width', '100%']],
        'overflow-hidden': [['overflow', 'hidden']],
      },
      null
    );
  });

  test('the content box scales from its top corner on the start side, in either direction', async () => {
    // The content box sits at start-0, so its scale keeps that corner put:
    // the top left, and the top right in a right-to-left document. `:where()`
    // adds nothing, so the rtl: rule wins on order alone.
    const css = await assertEmits(
      {
        'origin-top-left': [['transform-origin', 'top left']],
        'rtl:origin-top-right': [['transform-origin', 'top right']],
      },
      null
    );
    const [ltr] = rules(css, 'origin-top-left');
    const rtl = rules(css, 'rtl:origin-top-right');
    assert.deepEqual(
      rtl.map(({ selector }) => selector),
      [`.rtl:origin-top-right${RTL}`]
    );
    assert.ok(
      ltr.index < rtl[0].index,
      'rtl:origin-top-right is emitted before origin-top-left'
    );
  });
});
