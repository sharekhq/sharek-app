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

describe("The library's preview (MediaPreview's details line, footer and controls)", () => {
  test('the details line, the footer and its Delete emit their one rule, outside any query', async () => {
    await assertEmits(
      {
        // the details line under the name, its height kept while it is empty
        'h-[18px]': [['height', '18px']],
        'leading-[18px]': [['line-height', '18px']],
        // the footer after the stage, with the month and Delete
        'pt-[16px]': [['padding-top', '16px']],
        // Delete (symmetric padding, so the same in RTL)
        'px-[12px]': px('padding', '12px'),
        'rounded-[8px]': [['border-radius', '8px']],
        'bg-surface': [['background-color', 'var(--surface)']],
        'border-line': [['border-color', 'var(--line)']],
        'text-ink': [['color', 'var(--ink)']],
        'hover:border-inkSoft': [['border-color', 'var(--ink-soft)']],
      },
      null
    );
  });

  test('previous and next are 44px square, and Open original 44px wide, under a coarse pointer only', async () => {
    // Open original's and Delete's coarse:min-h-[44px] are Try again's, above.
    await assertEmits(
      {
        'coarse:w-[44px]': [['width', '44px']],
        'coarse:h-[44px]': [['height', '44px']],
        'coarse:min-w-[44px]': [['min-width', '44px']],
      },
      COARSE
    );
  });
});

describe('The tile (MediaTile)', () => {
  test("the frame, the button's corners, the name strip, the expand button and the order badge emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the square, its frame (brand while picked) and the tile's button
        'rounded-[6px]': [['border-radius', '6px']],
        'border-[4px]': [['border-width', '4px']],
        'border-brand': [['border-color', 'var(--brand)']],
        // the name strip over its scrim
        'py-[6px]': py('padding', '6px'),
        'text-[12px]': [['font-size', '12px']],
        'from-black/75': [
          [
            '--tw-gradient-from',
            'rgb(0 0 0 / 0.75) var(--tw-gradient-from-position)',
          ],
          ['--tw-gradient-to', 'rgb(0 0 0 / 0) var(--tw-gradient-to-position)'],
          [
            '--tw-gradient-stops',
            'var(--tw-gradient-from), var(--tw-gradient-to)',
          ],
        ],
        // the window's expand button, above the name strip
        'z-[100]': [['z-index', '100']],
        'w-[36px]': [['width', '36px']],
        'h-[36px]': [['height', '36px']],
        'bg-black/45': [['background-color', 'rgb(0 0 0 / 0.45)']],
        // the order badge, above the expand button, out past the bottom
        'z-[101]': [['z-index', '101']],
        'text-[14px]': [['font-size', '14px']],
        'font-[500]': [['font-weight', '500']],
        'w-[24px]': [['width', '24px']],
        'h-[24px]': [['height', '24px']],
        'bg-brand': [['background-color', 'var(--brand)']],
        '-bottom-[10px]': [['bottom', '-10px']],
      },
      null
    );
  });

  test("the expand button's and the strip's states emit, outside any query", async () => {
    const css = await assertEmits(
      {
        'hover:bg-black/[0.68]': [['background-color', 'rgb(0 0 0 / 0.68)']],
        'group-hover:opacity-100': [['opacity', '1']],
        'group-hover:pointer-events-auto': [['pointer-events', 'auto']],
        'focus-visible:opacity-100': [['opacity', '1']],
        'focus-visible:pointer-events-auto': [['pointer-events', 'auto']],
        'focus-visible:ring-2': [
          [
            '--tw-ring-offset-shadow',
            'var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color)',
          ],
          [
            '--tw-ring-shadow',
            'var(--tw-ring-inset) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color)',
          ],
          [
            'box-shadow',
            'var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)',
          ],
        ],
        'focus-visible:ring-brand': [['--tw-ring-color', 'var(--brand)']],
      },
      null
    );
    const selector = (className) => rules(css, className)[0].selector;
    assert.equal(
      selector('hover:bg-black/[0.68]'),
      '.hover:bg-black/[0.68]:hover'
    );
    assert.equal(
      selector('group-hover:pointer-events-auto'),
      '.group:hover .group-hover:pointer-events-auto'
    );
    assert.equal(
      selector('focus-visible:pointer-events-auto'),
      '.focus-visible:pointer-events-auto:focus-visible'
    );
  });

  test('under a coarse pointer only, the expand button and the name strip always show', async () => {
    // The expand button's 44px square is the preview's coarse:w-[44px] and
    // coarse:h-[44px], above.
    await assertEmits(
      {
        'coarse:opacity-100': [['opacity', '1']],
        'coarse:pointer-events-auto': [['pointer-events', 'auto']],
      },
      COARSE
    );
  });

  test("at 1025px and below the tile keeps its 6px inset, and the window's name strip hides", async () => {
    await assertEmits(
      {
        'mobile:p-[6px]': [['padding', '6px']],
        'mobile:hidden': [['display', 'none']],
      },
      MOBILE
    );
  });

  test('the name strip aligns to the start of its own direction', async () => {
    // The strip is dir="ltr". tailwindcss-rtl adds a physical side for the
    // page's direction to core's text-start, which outranks it, so in Arabic
    // a short name sat at the right. The arbitrary property is the native
    // start alone, one rule that resolves against the strip's own direction.
    const css = await emit(['[text-align:start]']);
    assert.deepEqual(
      rules(css, '[text-align:start]').map(({ selector, atRule, decls }) => ({
        selector,
        atRule,
        decls,
      })),
      [
        {
          selector: '.[text-align:start]',
          atRule: null,
          decls: [['text-align', 'start']],
        },
      ]
    );
  });

  test("the order badge's corner is logical only", async () => {
    const css = await emit(['-end-[10px]']);
    const found = rules(css, '-end-[10px]');
    assert.ok(found.length > 0, '-end-[10px] emitted no CSS');
    for (const rule of found) {
      assert.ok(
        rule.selector.startsWith('.'),
        `-end-[10px] emitted a direction-qualified rule "${rule.selector}"`
      );
      assert.deepEqual(
        rule.decls,
        [['inset-inline-end', '-10px']],
        '-end-[10px] emitted something other than inset-inline-end: -10px'
      );
    }
    assert.doesNotMatch(
      css,
      /(^|[\s;{])(left|right):/,
      'a physical side was emitted'
    );
  });
});

// The Media page's selection (T048, T049): the circle in MediaTile, Select
// all in MediaMonth's heading and the selection bar in MediaBox. Their 24px
// ring is the order badge's w-[24px] and h-[24px], their states the expand
// button's, and their 44px under a coarse pointer coarse:min-h-[44px],
// coarse:w-[44px] and coarse:h-[44px], all above.
describe("The selection (MediaTile's circle, MediaMonth's Select all and MediaBox's selection bar)", () => {
  test('the circle, its ring and the selection bar emit their one rule, outside any query', async () => {
    const css = await assertEmits(
      {
        // the circle's 40px hit box at the tile's top, and the ring's wash
        // while unselected
        'top-0': [['top', '0px']],
        'w-[40px]': [['width', '40px']],
        'h-[40px]': [['height', '40px']],
        'bg-black/30': [['background-color', 'rgb(0 0 0 / 0.3)']],
        // the selection bar's row and its count
        'gap-[12px]': [['gap', '12px']],
        'min-h-[44px]': [['min-height', '44px']],
        'text-[15px]': [['font-size', '15px']],
        // Clear and Delete, each 40px high (symmetric padding, so the same
        // in RTL)
        'px-[14px]': px('padding', '14px'),
        'bg-quiet': [['background-color', 'var(--quiet)']],
        'hover:bg-surface2': [['background-color', 'var(--surface-2)']],
        'px-[16px]': px('padding', '16px'),
        'bg-error': [['background-color', 'var(--error)']],
      },
      null
    );
    assert.equal(
      rules(css, 'hover:bg-surface2')[0].selector,
      '.hover:bg-surface2:hover'
    );
  });

  test("Select all shows, and takes a press, on hover of its own month, through the month's named group", async () => {
    // group/month on the month's section is a marker that emits nothing of
    // its own: the rules naming it are the button's, so hovering a tile
    // reveals no other tile's controls. Its focus and coarse states are the
    // expand button's, above.
    const css = await assertEmits(
      {
        'group-hover/month:opacity-100': [['opacity', '1']],
        'group-hover/month:pointer-events-auto': [['pointer-events', 'auto']],
      },
      null
    );
    const both = await emit([
      'group/month',
      'group-hover/month:opacity-100',
      'group-hover/month:pointer-events-auto',
    ]);
    assert.deepEqual(
      rules(both, 'group/month').map(({ selector }) => selector),
      [
        '.group/month:hover .group-hover/month:pointer-events-auto',
        '.group/month:hover .group-hover/month:opacity-100',
      ]
    );
    assert.equal(
      rules(css, 'group-hover/month:opacity-100')[0].selector,
      '.group/month:hover .group-hover/month:opacity-100'
    );
    assert.equal(
      rules(css, 'group-hover/month:pointer-events-auto')[0].selector,
      '.group/month:hover .group-hover/month:pointer-events-auto'
    );
  });

  test('the circle sits at the start side, and Select all and Delete at the end, in either direction', async () => {
    // tailwindcss-rtl adds a physical side for each direction to core's
    // inset-inline-start, so start-0 emits three rules, each at the start;
    // ms-auto is the logical margin alone.
    const pick = ({ selector, atRule, decls }) => ({ selector, atRule, decls });
    assert.deepEqual(rules(await emit(['start-0']), 'start-0').map(pick), [
      {
        selector: '.start-0',
        atRule: null,
        decls: [['inset-inline-start', '0px']],
      },
      {
        selector: '[dir="rtl"] .start-0',
        atRule: null,
        decls: [['right', '0px']],
      },
      {
        selector: '[dir="ltr"] .start-0',
        atRule: null,
        decls: [['left', '0px']],
      },
    ]);
    assert.deepEqual(rules(await emit(['ms-auto']), 'ms-auto').map(pick), [
      {
        selector: '.ms-auto',
        atRule: null,
        decls: [['margin-inline-start', 'auto']],
      },
    ]);
  });
});
