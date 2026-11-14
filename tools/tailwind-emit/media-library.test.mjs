// 057 — the media library. The tile's file (TilePicture in
// media/media.library.tsx, which the tile in media.component.tsx renders on
// both surfaces): the recess the file sits on, the placeholder's glyph, and the
// play badge in the tile's start or end corner. A variant or arbitrary value
// that Tailwind can't use emits nothing and the tile just doesn't change, so
// this file asserts what Tailwind emitted for each of them, with the project's
// own config (see emit.mjs). Each later piece adds its own describe.
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

const px = (prop, value) => [
  [`${prop}-left`, value],
  [`${prop}-right`, value],
];

describe("The tile's file (TilePicture)", () => {
  test("the recess's, the placeholder's and the play badge's own forms emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the recess the whole file sits on, and the placeholder's film glyph
        // when a video's still fails
        'bg-panel': [['background-color', 'var(--panel)']],
        'text-muted': [['color', 'var(--muted)']],
        // the play badge: over the file, 6px from the top, 20px tall, a dark
        // scrim with 6px on each side (symmetric, so the same in RTL)
        'z-[30]': [['z-index', '30']],
        'top-[6px]': [['top', '6px']],
        'h-[20px]': [['height', '20px']],
        'px-[6px]': px('padding', '6px'),
        'rounded-[4px]': [['border-radius', '4px']],
        'bg-black/60': [['background-color', 'rgb(0 0 0 / 0.6)']],
      },
      null
    );
  });

  test("the play badge's corner is logical only: start by default, or end", async () => {
    const forms = {
      'start-[6px]': 'inset-inline-start',
      'end-[6px]': 'inset-inline-end',
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
          rule.decls,
          [[prop, '6px']],
          `${className} emitted something other than ${prop}: 6px`
        );
      }
    }
    assert.doesNotMatch(
      css,
      /(^|[\s;{])(left|right):/,
      'a physical side was emitted'
    );
  });
});
