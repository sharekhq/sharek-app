// 055 — the shell and Studio look refresh. Studio's gallery (studio.component.tsx):
// the intro and search row, the chip row, the sections' grid and the card with
// its picture's frame, the marks on the picture and the text under it. A
// variant or arbitrary value that Tailwind can't use emits nothing and the page
// just doesn't change, so this file asserts what Tailwind emitted for each of
// them, with the project's own config (see emit.mjs). Each increment adds its
// own describe.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

const PHONE = '(max-width: 768px)';
const MOTION_SAFE = '(prefers-reduced-motion: no-preference)';

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
// unescaped selector (so the grid's `\2c ` reads as a comma), the at-rule it
// sits in, and its declarations as [property, value] pairs.
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

describe('Studio (increment 1)', () => {
  test("the card's, the grid's and the search box's own forms emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the picture's 16:10 frame, and the dark disc and chips on it
        'aspect-[16/10]': [['aspect-ratio', '16/10']],
        'bg-black/70': [['background-color', 'rgb(0 0 0 / 0.7)']],
        'top-[10px]': [['top', '10px']],
        'bottom-[10px]': [['bottom', '10px']],
        // the name and the description, two lines at most; the description
        // holds its two lines' height so a row of cards lines up
        'line-clamp-2': [
          ['overflow', 'hidden'],
          ['display', '-webkit-box'],
          ['-webkit-box-orient', 'vertical'],
          ['-webkit-line-clamp', '2'],
        ],
        'min-h-[3em]': [['min-height', '3em']],
        // StudioSection's grid: as many 280px columns as fit
        'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]': [
          ['grid-template-columns', 'repeat(auto-fill,minmax(280px,1fr))'],
        ],
        // the search box beside the intro
        'w-[340px]': [['width', '340px']],
      },
      null
    );
  });

  test('the card lifts on hover only when motion is welcome, and gains its shadow either way', async () => {
    // research R15: with reduced motion the card gains its shadow and does
    // not move.
    const css = await emit([
      'hover:shadow-card',
      'motion-safe:hover:-translate-y-[2px]',
    ]);

    const lift = rules(css, 'motion-safe:hover:-translate-y-[2px]');
    assert.ok(lift.length > 0, 'the lift emitted no CSS');
    for (const rule of lift) {
      assert.equal(
        rule.atRule,
        MOTION_SAFE,
        `the lift emitted "${rule.selector}" under ${rule.atRule}`
      );
      assert.ok(
        rule.selector.endsWith(':hover'),
        `the lift emitted "${rule.selector}", not on hover`
      );
      assert.deepEqual(rule.decls[0], ['--tw-translate-y', '-2px']);
      assert.ok(
        rule.decls.some(([prop]) => prop === 'transform'),
        'the lift sets no transform'
      );
    }

    const shadow = rules(css, 'hover:shadow-card');
    assert.ok(shadow.length > 0, 'the hover shadow emitted no CSS');
    for (const rule of shadow) {
      assert.equal(rule.atRule, null, 'the hover shadow sits in a query');
      assert.ok(rule.selector.endsWith(':hover'));
      assert.deepEqual(rule.decls[0], ['--tw-shadow', 'var(--shadow-card)']);
    }
  });

  test('the chip row scrolls with no scrollbar', async () => {
    const css = await assertEmits(
      {
        '[scrollbar-width:none]': [['scrollbar-width', 'none']],
        '[&::-webkit-scrollbar]:hidden': [['display', 'none']],
      },
      null
    );
    assert.deepEqual(
      rules(css, '[&::-webkit-scrollbar]:hidden').map((r) => r.selector),
      ['.[&::-webkit-scrollbar]:hidden::-webkit-scrollbar']
    );
  });

  test('every phone: class of the card, the grid, the header row and the chip row emits, and only inside the phone screen', async () => {
    await assertEmits(
      {
        // the card: a row, the frame first at 128px with no ratio, the text
        // centred, the category line and the facts gone, the description free
        // of its two lines' height
        'phone:flex-row': [['flex-direction', 'row']],
        'phone:w-[128px]': [['width', '128px']],
        'phone:aspect-auto': [['aspect-ratio', 'auto']],
        'phone:min-h-[100px]': [['min-height', '100px']],
        'phone:py-[10px]': py('padding', '10px'),
        'phone:px-[12px]': px('padding', '12px'),
        'phone:justify-center': [['justify-content', 'center']],
        'phone:hidden': [['display', 'none']],
        'phone:min-h-0': [['min-height', '0px']],
        // the grid: one column of rows
        'phone:grid-cols-1': [
          ['grid-template-columns', 'repeat(1, minmax(0, 1fr))'],
        ],
        'phone:gap-[10px]': [['gap', '10px']],
        // the header row: the intro and the search stacked, the search full
        // width
        'phone:flex-col': [['flex-direction', 'column']],
        'phone:items-stretch': [['align-items', 'stretch']],
        'phone:gap-[12px]': [['gap', '12px']],
        'phone:w-full': [['width', '100%']],
        // the chip row: one row that scrolls sideways, padded for the rings
        'phone:flex-nowrap': [['flex-wrap', 'nowrap']],
        'phone:overflow-x-auto': [['overflow-x', 'auto']],
        'phone:p-[2px]': [['padding', '2px']],
      },
      PHONE
    );
  });

  test("the picture's corner marks and the chips' sides are logical only", async () => {
    const forms = {
      // the maker's plate and the lock badge at the start, the length at the
      // end
      'start-[10px]': 'inset-inline-start',
      'end-[10px]': 'inset-inline-end',
      // a chip's sides
      'ps-[14px]': 'padding-inline-start',
      'pe-[8px]': 'padding-inline-end',
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
          rule.decls.map(([name]) => name),
          [prop],
          `${className} emitted something other than ${prop}`
        );
      }
    }
    assert.doesNotMatch(
      css,
      /(^|[\s;{])(left|right|padding-left|padding-right):/,
      'a physical side was emitted'
    );
  });
});
