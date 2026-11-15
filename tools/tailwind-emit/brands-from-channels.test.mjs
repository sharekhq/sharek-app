// 058 — brands from the channel list. The post card's tag names
// (launches/calendar.post.card.tsx), which hide under the pointer keeping
// their space; the channel ⋯ menu (launches/menu/menu.tsx), which takes
// Samy's chat menu look from launches/post.actions.menu.tsx; and Move to
// brand: the row's ⋯ it keeps shown (launches/channel.panel.tsx), its list's
// + New brand (brands/brand.menu.tsx) and New brand's line for the channel it
// moves (brands/brand.dialogs.tsx). A variant or arbitrary value that Tailwind
// can't use emits nothing and the page just doesn't change, so this file
// asserts what Tailwind emitted for each of them, with the project's own config
// (see emit.mjs). Each phase adds its own describe.
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

describe("The channel ⋯ menu's look (phase 5)", () => {
  // The rows' svgs keep upstream's 18px and 16px attributes; the icon box
  // (MENU_ICON) draws every one of them at 16px.
  test('draws the svgs inside an icon box at 16px, outside any query', async () => {
    const css = await assertEmits(
      {
        '[&_svg]:size-4': [
          ['width', '1rem'],
          ['height', '1rem'],
        ],
      },
      null
    );
    assert.deepEqual(
      rules(css, '[&_svg]:size-4').map((r) => r.selector),
      ['.[&_svg]:size-4 svg']
    );
  });

  test('spaces its panel and rows and lights a row under the pointer, outside any query', async () => {
    const css = await assertEmits(
      {
        'p-[6px]': [['padding', '6px']],
        'gap-[10px]': [['gap', '10px']],
        'hover:bg-boxHover': [['background-color', 'var(--new-box-hover)']],
      },
      null
    );
    assert.deepEqual(
      rules(css, 'hover:bg-boxHover').map((r) => r.selector),
      ['.hover:bg-boxHover:hover']
    );
  });
});

describe('Move to brand (phase 7)', () => {
  // On a wide screen the list hangs in the body, so the row loses its hover
  // and its focus once they move into it; the held box, data-open while the
  // list is open, keeps the row's ⋯ shown.
  test("keeps the row's ⋯ shown while its list is open, outside any query", async () => {
    const css = await assertEmits(
      { 'has-[[data-open]]:opacity-100': [['opacity', '1']] },
      null
    );
    assert.deepEqual(
      rules(css, 'has-[[data-open]]:opacity-100').map((r) => r.selector),
      ['.has-[[data-open]]:opacity-100:has([data-open])']
    );
  });

  test("spaces the list's + New brand, 44px high, with its ring for focus only, outside any query", async () => {
    const css = await assertEmits(
      {
        'gap-[8px]': [['gap', '8px']],
        'min-h-[44px]': [['min-height', '44px']],
        // symmetric, so the same in RTL
        'px-[10px]': [
          ['padding-left', '10px'],
          ['padding-right', '10px'],
        ],
        'rounded-[8px]': [['border-radius', '8px']],
        'text-[13px]': [['font-size', '13px']],
        'font-[600]': [['font-weight', '600']],
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
    assert.deepEqual(
      ['focus-visible:ring-2', 'focus-visible:ring-brand'].map(
        (className) => rules(css, className)[0].selector
      ),
      [
        '.focus-visible:ring-2:focus-visible',
        '.focus-visible:ring-brand:focus-visible',
      ]
    );
  });

  test("frames New brand's line for the channel it moves, a long name wrapping inside it, outside any query", async () => {
    await assertEmits(
      {
        'gap-[12px]': [['gap', '12px']],
        'p-[12px]': [['padding', '12px']],
        'rounded-[10px]': [['border-radius', '10px']],
        'text-[14px]': [['font-size', '14px']],
        'break-words': [['overflow-wrap', 'break-word']],
      },
      null
    );
  });
});
