// 060 — dashboard polish. The page and card paddings every dashboard page
// shares (PAGE_PADDING and CARD_PADDING in ui/page.scroll.tsx); the side
// panels; Samy's chat; Studio's grid and its tool windows; the brands'
// logo tiles; Settings' menu and its windows' action rows; the window shell
// (layout/new-modal.tsx); the Add a channel menu's rows; compose on a phone;
// the cards and boxes; the sign-in pages; the checkout with no plan; the admin
// pages and the impersonation bar. A variant or arbitrary value that Tailwind
// can't use emits nothing and the page just doesn't change, so this file
// asserts what Tailwind emitted for each new class, with the project's own
// config (see emit.mjs). Each later task adds its own describe.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import * as sass from 'sass';

import { emit } from './emit.mjs';

const MOBILE = '@media (max-width: 1025px)';
const COARSE = '@media (pointer: coarse)';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const unescape = (s) =>
  s.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch
  );

// Where a class name may end inside a selector: the selector's end, a pseudo
// (`:disabled`), a combinator or the end of a selector list. So
// `mobile:p-[12px]` doesn't also find a longer class that starts with it.
const ENDS = new Set([undefined, ':', ' ', '>', ',', ')']);

const names = (selector, className) => {
  const needle = `.${className}`;
  for (let at = selector.indexOf(needle); at !== -1; ) {
    if (ENDS.has(selector[at + needle.length])) return true;
    at = selector.indexOf(needle, at + 1);
  }
  return false;
};

// Every rule that names `className`, in the order Tailwind emitted them: its
// unescaped selector, the at-rule it sits in (its name and params, so a
// container query can't pass for a media query), its declarations as
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
        rule.parent?.type === 'atrule'
          ? `@${rule.parent.name} ${collapse(rule.parent.params)}`
          : null,
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

describe('Every new class', () => {
  test('emits outside any query', async () => {
    await assertEmits(
      {
        // the side panels' top (§3)
        'pt-[12px]': [['padding-top', '12px']],
        // Samy's chat (§4)
        'px-[20px]': [
          ['padding-left', '20px'],
          ['padding-right', '20px'],
        ],
        // Studio's grid, a card's preview and its row (§5)
        'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]': [
          ['grid-template-columns', 'repeat(auto-fill,minmax(220px,1fr))'],
        ],
        'aspect-video': [['aspect-ratio', '16 / 9']],
        'flex-row-reverse': [['flex-direction', 'row-reverse']],
        // the brands' grid, three to a row at most (§6); Tailwind spaces the
        // `/` inside `calc`
        'grid-cols-[repeat(auto-fill,minmax(max(240px,calc((100%_-_32px)/3)),1fr))]':
          [
            [
              'grid-template-columns',
              'repeat(auto-fill,minmax(max(240px,calc((100% - 32px) / 3)),1fr))',
            ],
          ],
        // titles: Studio's cards, the window shell, the sign-in pages, the
        // checkout, the admin pages (§5, §11, §15 to §17)
        'text-[20px]': [['font-size', '20px']],
        'text-[32px]': [['font-size', '32px']],
        'leading-[1.2]': [['line-height', '1.2']],
        // radii: the window shell (§11); the sign-in pages, the checkout and
        // the admin pages (§15 to §17); a Calendar post and its body, a Media
        // tile (§14)
        'rounded-[24px]': [['border-radius', '24px']],
        'rounded-[12px]': [['border-radius', '12px']],
        'rounded-[8px]': [['border-radius', '8px']],
        'rounded-b-[8px]': [
          ['border-bottom-right-radius', '8px'],
          ['border-bottom-left-radius', '8px'],
        ],
        // heights: the tool windows' fields, the checkout's and the admin
        // pages' controls (§9, §16, §17); the Add a channel menu's rows (§12)
        'h-[40px]': [['height', '40px']],
        'min-h-[36px]': [['min-height', '36px']],
        // text: the tool windows, the Add a channel menu's rows, the sign-in
        // pages, among others (§5, §9, §12, §15)
        'text-[14px]': [['font-size', '14px']],
        'text-[12px]': [['font-size', '12px']],
        'font-[400]': [['font-weight', '400']],
        'font-[500]': [['font-weight', '500']],
        'font-[600]': [['font-weight', '600']],
        // the token colours
        'border-line': [['border-color', 'var(--line)']],
        'bg-newBgColor': [['background-color', 'var(--new-bgColor)']],
        'bg-newBgColorInner': [['background-color', 'var(--new-bgColorInner)']],
        'text-ink': [['color', 'var(--ink)']],
        'text-muted': [['color', 'var(--muted)']],
        'bg-surface2': [['background-color', 'var(--surface-2)']],
        'text-error': [['color', 'var(--error)']],
        // Tailwind's own white, the shared primary's text, not a token
        'text-white': [
          ['--tw-text-opacity', '1'],
          ['color', 'rgb(255 255 255 / var(--tw-text-opacity, 1))'],
        ],
      },
      null
    );
  });

  test('emits at 1025px and below only', async () => {
    await assertEmits(
      {
        // PAGE_PADDING and CARD_PADDING (§1)
        'mobile:p-[12px]': [['padding', '12px']],
        'mobile:p-[16px]': [['padding', '16px']],
        // the side panels' top (§3)
        'mobile:pt-[20px]': [['padding-top', '20px']],
        // the page margins (§2) and Samy's chat (§4)
        'mobile:px-[6px]': [
          ['padding-left', '6px'],
          ['padding-right', '6px'],
        ],
        'mobile:px-[12px]': [
          ['padding-left', '12px'],
          ['padding-right', '12px'],
        ],
        // compose on a phone (§13)
        'mobile:border-line': [['border-color', 'var(--line)']],
        // a Calendar post's body (§14)
        'mobile:rounded-[8px]': [['border-radius', '8px']],
      },
      MOBILE
    );
  });

  test('emits under a coarse pointer only', async () => {
    await assertEmits(
      {
        // the tool windows' fields and the Add a channel menu's rows (§9, §12)
        'coarse:h-[44px]': [['height', '44px']],
        'coarse:min-h-[44px]': [['min-height', '44px']],
        'coarse:text-[16px]': [['font-size', '16px']],
      },
      COARSE
    );
  });

  test('dims a disabled control on :disabled only, outside any query', async () => {
    const css = await assertEmits(
      { 'disabled:opacity-50': [['opacity', '0.5']] },
      null
    );
    assert.deepEqual(
      rules(css, 'disabled:opacity-50').map((r) => r.selector),
      ['.disabled:opacity-50:disabled']
    );
  });
});

// Samy's chat is styled from global.scss against CopilotKit 1.72's own
// stylesheet, which the app loads after it, so a global.scss rule only takes
// where its selector outweighs CopilotKit's. The describes below read both
// sheets, as those rules are no class.
const require = createRequire(import.meta.url);
// Classes and attributes; `:has()` weighs as its argument.
const weight = (selector) => (selector.match(/[.[]/g) || []).length;
// The compound a selector styles: its last, once `(…)` arguments are gone.
const subject = (selector) =>
  selector
    .replace(/\([^()]*\)/g, '')
    .split(/[\s>+~]+/)
    .pop();
const vendorSheet = () =>
  postcss.parse(
    readFileSync(require.resolve('@copilotkit/react-ui/styles.css'), 'utf8')
  );
const appSheet = () =>
  postcss.parse(
    sass.compile(
      fileURLToPath(
        new URL('../../apps/frontend/src/app/global.scss', import.meta.url)
      ),
      {
        loadPaths: [
          fileURLToPath(new URL('../../node_modules', import.meta.url)),
        ],
      }
    ).css
  );

// Samy's column (§4): the messages and the message box sit on the page's
// gutter, PAGE_PADDING's 20px and 12px at 1025px and below, as the header
// above them does. Both are CopilotKit's boxes, padded from global.scss's
// `.agent` block.
describe("Samy's column", () => {
  const MESSAGES = '.copilotKitMessagesContainer';
  const INPUT = '.copilotKitInputContainer';
  // Every padding declaration on a rule that styles one of the two boxes, in
  // sheet order, as [selector, property, value, !important, the at-rule it
  // sits in]; `which` picks the selectors.
  const paddings = (sheet, which) => {
    const found = [];
    sheet.walkDecls(/^padding/, (decl) => {
      const rule = decl.parent;
      if (rule.type !== 'rule') return;
      const atRule =
        rule.parent.type === 'atrule'
          ? `@${rule.parent.name} ${collapse(rule.parent.params)}`
          : null;
      for (const selector of rule.selectors.map(collapse)) {
        if (which(selector)) {
          found.push([
            selector,
            decl.prop,
            decl.value,
            !!decl.important,
            atRule,
          ]);
        }
      }
    });
    return found;
  };
  const isBox = (selector) => [MESSAGES, INPUT].includes(subject(selector));
  const own = (selector) =>
    selector === `.agent ${MESSAGES}` || selector === `.agent ${INPUT}`;

  test('pads the messages 20px and the message box 0 20px, 12px at 1025px and below', () => {
    assert.deepEqual(paddings(appSheet(), own), [
      [`.agent ${MESSAGES}`, 'padding', '20px', false, null],
      [`.agent ${INPUT}`, 'padding', '0 20px', true, null],
      [`.agent ${MESSAGES}`, 'padding', '12px', false, MOBILE],
      [`.agent ${INPUT}`, 'padding', '0 12px', true, MOBILE],
    ]);
  });

  test("out-ranks CopilotKit's padding on each box", () => {
    const vendor = paddings(vendorSheet(), isBox);
    assert.deepEqual(
      vendor.map(([selector, prop, value, , atRule]) => [
        selector,
        prop,
        value,
        atRule,
      ]),
      [
        [INPUT, 'padding', '0', null],
        [INPUT, 'padding-bottom', '15px', null],
        [MESSAGES, 'padding', '1rem 24px', null],
      ],
      "CopilotKit's padding on Samy's boxes changed; re-check contracts/ui.md §4"
    );

    const app = paddings(appSheet(), own);
    assert.equal(app.length, 4);
    for (const [selector] of app) {
      for (const [theirs] of vendor.filter(
        ([other]) => subject(other) === subject(selector)
      )) {
        assert.ok(
          weight(selector) > weight(theirs),
          `${selector} doesn't outweigh CopilotKit's ${theirs}`
        );
      }
    }
  });

  test('nests no `.agent` inside `.agent`', () => {
    const nested = [];
    appSheet().walkRules((rule) => {
      for (const selector of rule.selectors.map(collapse)) {
        if (selector.startsWith('.agent .agent')) nested.push(selector);
      }
    });
    assert.deepEqual(nested, []);
  });
});

// The sign-in showcase (§15): the fades over the top and bottom of the
// pictures blend into the page, so they start from the theme's `--bg`, the
// colour bg-newBgColor paints the page with, instead of a fixed dark one.
describe('The sign-in showcase', () => {
  // Every background declaration on a rule whose selector is `.name`.
  const backgrounds = (sheet, name) => {
    const found = [];
    sheet.walkDecls(/^background/, (decl) => {
      const rule = decl.parent;
      if (rule.type === 'rule' && rule.selectors.includes(name)) {
        found.push([decl.prop, collapse(decl.value)]);
      }
    });
    return found;
  };

  for (const fade of ['.blackGradTopBg', '.blackGradBottomBg']) {
    test(`${fade} fades from the theme's background`, () => {
      const found = backgrounds(appSheet(), fade);
      assert.deepEqual(found, [
        [
          'background',
          'linear-gradient(180deg, var(--bg) 0%, transparent 100%)',
        ],
      ]);
      for (const [, value] of found) assert.ok(!value.includes('#'), value);
    });
  }
});
