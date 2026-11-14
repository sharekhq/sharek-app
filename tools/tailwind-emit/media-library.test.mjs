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

const MOBILE = '(max-width: 1025px)';
const COARSE = '(pointer: coarse)';

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
const py = (prop, value) => [
  [`${prop}-top`, value],
  [`${prop}-bottom`, value],
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

describe('The month heading (MediaMonth)', () => {
  test("the month's section, its sticky heading, the count and its skeleton bar emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the month's section and its heading, above the tiles' highest
        // control (the order badge's z-[101])
        'mb-[10px]': [['margin-bottom', '10px']],
        'z-[110]': [['z-index', '110']],
        'gap-[10px]': [['gap', '10px']],
        'py-[10px]': py('padding', '10px'),
        // the month's name and its count
        'text-[16px]': [['font-size', '16px']],
        'font-[600]': [['font-weight', '600']],
        'text-[13px]': [['font-size', '13px']],
        // the bar drawn until the count answers
        'w-[56px]': [['width', '56px']],
        'h-[12px]': [['height', '12px']],
        'rounded-[4px]': [['border-radius', '4px']],
      },
      null
    );
  });
});

describe("The list's loading, failure and end lines (MediaBox)", () => {
  test("the first load's skeleton heading, the failure line with Try again and the end line emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the skeleton heading's bar while page 1 loads
        'w-[120px]': [['width', '120px']],
        'h-[20px]': [['height', '20px']],
        // the failure line and the end line
        'py-[16px]': py('padding', '16px'),
        'gap-[8px]': [['gap', '8px']],
        'text-[13px]': [['font-size', '13px']],
        // Try again (symmetric padding, so the same in RTL)
        'px-[8px]': px('padding', '8px'),
        'rounded-[4px]': [['border-radius', '4px']],
        'font-[600]': [['font-weight', '600']],
        'text-brandText': [['color', 'var(--brand-text)']],
      },
      null
    );
  });

  test('Try again is 44px high under a coarse pointer only', async () => {
    await assertEmits(
      { 'coarse:min-h-[44px]': [['min-height', '44px']] },
      COARSE
    );
  });
});

describe("The toolbar's search, type filter and sort (MediaBox)", () => {
  test("the filter's group and buttons and the sort emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the filter's bordered group
        'gap-[4px]': [['gap', '4px']],
        'p-[4px]': [['padding', '4px']],
        'border-newTableBorder': [['border-color', 'var(--new-table-border)']],
        // its buttons, pressed or not
        'h-[34px]': [['height', '34px']],
        'font-[600]': [['font-weight', '600']],
        'bg-selectedBg': [['background-color', 'var(--selected-bg)']],
        'text-selectedText': [['color', 'var(--selected-text)']],
        'hover:text-ink': [['color', 'var(--ink)']],
        // the sort's native select
        'h-[44px]': [['height', '44px']],
      },
      null
    );
  });

  test("the filter's buttons are 44px high under a coarse pointer only", async () => {
    await assertEmits(
      { 'coarse:min-h-[44px]': [['min-height', '44px']] },
      COARSE
    );
  });

  test('at 1025px and below the filter and the sort come after the search and Upload, the filter filling its row', async () => {
    await assertEmits(
      {
        'mobile:order-1': [['order', '1']],
        'mobile:flex-1': [['flex', '1 1 0%']],
        // symmetric, so the same in RTL
        'mobile:px-[6px]': px('padding', '6px'),
      },
      MOBILE
    );
  });

  test("the search's glyph, the sort's chevron and the padding beside them are logical only", async () => {
    const forms = {
      // the search's leading glyph and the room the input keeps for it
      'start-[14px]': ['inset-inline-start', '14px'],
      'ps-[42px]': ['padding-inline-start', '42px'],
      'pe-[14px]': ['padding-inline-end', '14px'],
      // the sort's chevron at its end and the room the select keeps for it
      'end-[12px]': ['inset-inline-end', '12px'],
      'ps-[14px]': ['padding-inline-start', '14px'],
      'pe-[36px]': ['padding-inline-end', '36px'],
    };
    const css = await emit(Object.keys(forms));
    for (const [className, decl] of Object.entries(forms)) {
      const found = rules(css, className);
      assert.ok(found.length > 0, `${className} emitted no CSS`);
      for (const rule of found) {
        assert.ok(
          rule.selector.startsWith('.'),
          `${className} emitted a direction-qualified rule "${rule.selector}"`
        );
        assert.deepEqual(
          rule.decls,
          [decl],
          `${className} emitted something other than ${decl.join(': ')}`
        );
      }
    }
    assert.doesNotMatch(
      css,
      /(^|[\s;{])(padding-)?(left|right):/,
      'a physical side was emitted'
    );
  });
});
