// 059 — dashboard consistency. The sidebar's short size (the railShort
// variant in apps/frontend/tailwind.config.cjs, measured on the rail's own
// height through the #left-menu container in new-layout/layout.component.tsx,
// and used by layout/top.menu.tsx and new-layout/menu-item.tsx); the shell
// that stops the window scrolling above 1025px
// (new-layout/layout.component.tsx); the shared Button
// (libraries/react-shared-libraries/src/form/button.tsx) and the on/off switch
// (form/slider.tsx); the settings menu (settings/settings.menu.tsx); the
// brands overview (brands/brands.overview.tsx); a chart alone in its row
// (platform-analytics/render.analytics.tsx); and Samy's welcome
// (agents/agent.welcome.tsx). A variant or arbitrary value that Tailwind can't
// use emits nothing and the page just doesn't change, so this file asserts
// what Tailwind emitted for each of them, with the project's own config (see
// emit.mjs). Each later task adds its own describe.
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

const RAIL_SHORT = '@container rail (max-height: 799.98px)';
const MOBILE = '@media (max-width: 1025px)';
const PHONE = '@media (max-width: 768px)';
const COARSE = '@media (pointer: coarse)';
const RTL = ':where([dir="rtl"], [dir="rtl"] *)';

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const unescape = (s) =>
  s.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ch
  );

// Where a class name may end inside a selector: the selector's end, a pseudo
// (`:where(…)` for `rtl:`), a combinator (`>` for an `[&>*…]:` variant) or
// the end of a selector list. So `mobile:h-auto` doesn't also find a longer
// class that starts with it.
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

const TRANSFORM =
  'translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))';

describe('The sidebar', () => {
  // The groups' gap (top.menu.tsx), an item's padding and its tile
  // (menu-item.tsx) shrink when the rail itself is under 800px tall, so an
  // admin's rail, 60px shorter than the screen, turns short on its own height.
  test('shrinks the groups, the items and the tiles inside a rail under 800px tall only', async () => {
    await assertEmits(
      {
        'railShort:gap-[4px]': [['gap', '4px']],
        'railShort:py-[2px]': [
          ['padding-top', '2px'],
          ['padding-bottom', '2px'],
        ],
        'railShort:w-[36px]': [['width', '36px']],
        'railShort:h-[36px]': [['height', '36px']],
      },
      RAIL_SHORT
    );
  });

  test('names the rail a size container, outside any query', async () => {
    const css = await assertEmits(
      { '[container:rail/size]': [['container', 'rail/size']] },
      null
    );
    assert.deepEqual(
      rules(css, '[container:rail/size]').map((r) => r.selector),
      ['.[container:rail/size]']
    );
  });
});

describe('Every new class', () => {
  test('emits outside any query', async () => {
    await assertEmits(
      {
        // the shell above 1025px, its row
        'h-dvh': [['height', '100dvh']],
        'min-h-0': [['min-height', '0px']],
        // the rail's column and logo row; the brands overview's grid
        'gap-[16px]': [['gap', '16px']],
        'mb-[16px]': [['margin-bottom', '16px']],
        // the brands overview: its grid, a card's mark and note, New brand
        'grid-cols-[repeat(auto-fill,minmax(240px,1fr))]': [
          ['grid-template-columns', 'repeat(auto-fill,minmax(240px,1fr))'],
        ],
        'rounded-[11px]': [['border-radius', '11px']],
        'text-[12.5px]': [['font-size', '12.5px']],
        'border-[1.5px]': [['border-width', '1.5px']],
        // the settings menu: a row, the version
        'min-h-[36px]': [['min-height', '36px']],
        'text-[11.5px]': [['font-size', '11.5px']],
        // Samy's welcome: its line, its ideas, an idea
        'max-w-[430px]': [['max-width', '430px']],
        'max-w-[560px]': [['max-width', '560px']],
        'min-h-[52px]': [['min-height', '52px']],
        // the on/off switch's pill
        'p-[2px]': [['padding', '2px']],
      },
      null
    );
  });

  test('emits at 1025px and below only', async () => {
    await assertEmits(
      {
        // the shell grows with its page and the window scrolls
        'mobile:h-auto': [['height', 'auto']],
        // the settings menu's groups give their rows to the strip
        'mobile:contents': [['display', 'contents']],
      },
      MOBILE
    );
  });

  test("puts Samy's ideas in one column at 768px and below only", async () => {
    await assertEmits(
      {
        'phone:grid-cols-1': [
          ['grid-template-columns', 'repeat(1, minmax(0, 1fr))'],
        ],
      },
      PHONE
    );
  });

  test('makes buttons, switch options and settings rows 44px high under a coarse pointer only', async () => {
    await assertEmits(
      { 'coarse:min-h-[44px]': [['min-height', '44px']] },
      COARSE
    );
  });

  test("moves the on/off switch's knob to the end in either direction", async () => {
    // `:where()` adds nothing, so the rtl: rule wins on order alone.
    const css = await assertEmits(
      {
        'translate-x-[20px]': [
          ['--tw-translate-x', '20px'],
          ['transform', TRANSFORM],
        ],
        'rtl:-translate-x-[20px]': [
          ['--tw-translate-x', '-20px'],
          ['transform', TRANSFORM],
        ],
      },
      null
    );
    const [ltr] = rules(css, 'translate-x-[20px]');
    const [rtl] = rules(css, 'rtl:-translate-x-[20px]');
    assert.equal(rtl.selector, `.rtl:-translate-x-[20px]${RTL}`);
    assert.ok(
      ltr.index < rtl.index,
      'rtl:-translate-x-[20px] is emitted before translate-x-[20px]'
    );
  });

  test('spans the row with a chart alone in it, outside any query', async () => {
    const css = await assertEmits(
      {
        '[&>*:last-child:nth-child(odd)]:col-span-full': [
          ['grid-column', '1 / -1'],
        ],
      },
      null
    );
    assert.deepEqual(
      rules(css, '[&>*:last-child:nth-child(odd)]:col-span-full').map(
        (r) => r.selector
      ),
      [
        '.[&>*:last-child:nth-child(odd)]:col-span-full>*:last-child:nth-child(odd)',
      ]
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

// Samy's welcome (agents/agent.welcome.tsx) is CopilotChat's
// RenderSuggestionsList, drawn straight inside footer.copilotKitMessagesFooter,
// the second child of the scrolling .copilotKitMessages column. Auto block
// margins centre it in the room the empty messages leave; CopilotKit's own
// footer rule sets `margin: 8px auto 0 auto`, so global.scss's rule must
// outrank it by specificity.
describe("Samy's welcome", () => {
  const FOOTER = '.copilotKitMessagesFooter';
  // Every margin declaration whose rule styles the footer itself, in any
  // query, as [selector, declaration].
  const footerMargins = (sheet) => {
    const found = [];
    sheet.walkDecls(/^margin/, (decl) => {
      for (const selector of decl.parent.selector.split(',').map(collapse)) {
        if (names(subject(selector), FOOTER.slice(1))) {
          found.push([selector, decl]);
        }
      }
    });
    return found;
  };

  test("sits centred in the empty chat, out-ranking CopilotKit's footer margin", () => {
    const vendor = footerMargins(vendorSheet());
    assert.deepEqual(
      vendor.map(([selector, decl]) => [selector, decl.prop, decl.value]),
      [[FOOTER, 'margin', '8px auto 0 auto']],
      `CopilotKit's ${FOOTER} margin changed; re-check design note D4`
    );

    const app = footerMargins(appSheet());
    assert.deepEqual(
      app.map(([selector, decl]) => [
        selector,
        decl.prop,
        decl.value,
        !!decl.important,
        decl.parent.parent.type,
      ]),
      [
        [
          '.agent .copilotKitMessagesFooter:has(> [data-samy-welcome])',
          'margin-block',
          'auto',
          false,
          'root',
        ],
      ]
    );
    assert.ok(weight(app[0][0]) > weight(FOOTER));
  });
});

// Samy's messages and message box at 15px on a wide screen (research R11).
// CopilotKit sets both at 1rem, and global.scss sets the box at 1rem too, so
// each wide-screen rule must outweigh those; phones and a coarse pointer keep
// 16px, so iOS doesn't zoom into the box. Arabic keeps its taller lines.
describe("Samy's text", () => {
  const WIDE = '@media (min-width: 1026px)';
  const WIDE_FINE = '@media (min-width: 1026px) and (pointer: fine)';
  const BOX = '.copilotKitInput > textarea';
  const isMessage = (selector) => {
    const own = subject(selector).match(/\.[\w-]+/g) || [];
    return (
      own.includes('.copilotKitMessage') || own.includes('.copilotKitParagraph')
    );
  };
  const isBox = (selector) => selector.endsWith(BOX);
  // Every font-size and line-height declaration on a selector `which` picks,
  // in sheet order, as [selector, property, value, the at-rule it sits in].
  const sizes = (sheet, which) => {
    const found = [];
    sheet.walkDecls(/^(font-size|line-height)$/, (decl) => {
      const rule = decl.parent;
      if (rule.type !== 'rule') return;
      const atRule =
        rule.parent.type === 'atrule'
          ? `@${rule.parent.name} ${collapse(rule.parent.params)}`
          : null;
      for (const selector of rule.selectors.map(collapse)) {
        if (which(selector)) {
          found.push([selector, decl.prop, decl.value, atRule]);
        }
      }
    });
    return found;
  };
  const MESSAGE = '.agent .copilotKitMessages .copilotKitMessage';
  const PARAGRAPH = '.agent .copilotKitMessages .copilotKitParagraph';
  const ARABIC = 'html[lang=ar] ';

  test("sets Samy's messages at 15px with 24px lines above 1025px, out-ranking CopilotKit's", () => {
    const vendor = sizes(vendorSheet(), isMessage);
    assert.deepEqual(
      vendor,
      [
        ['.copilotKitMessage', 'font-size', '1rem', null],
        ['.copilotKitMessage', 'line-height', '1.5', null],
        [
          '.copilotKitMessage.copilotKitUserMessage',
          'line-height',
          '1.75',
          null,
        ],
        ['.copilotKitMessage.copilotKitUserMessage', 'font-size', '1rem', null],
        ['.copilotKitParagraph', 'line-height', '1.75', null],
        ['.copilotKitParagraph', 'font-size', '1rem', null],
      ],
      "CopilotKit's message sizes changed; re-check research R11"
    );

    const wide = sizes(appSheet(), isMessage).filter(
      ([selector, , , atRule]) =>
        atRule === WIDE && !selector.startsWith(ARABIC)
    );
    assert.deepEqual(wide, [
      [MESSAGE, 'font-size', '15px', WIDE],
      [PARAGRAPH, 'font-size', '15px', WIDE],
      [MESSAGE, 'line-height', '24px', WIDE],
      [PARAGRAPH, 'line-height', '24px', WIDE],
    ]);
    const theirs = Math.max(...vendor.map(([selector]) => weight(selector)));
    for (const [selector] of wide) {
      assert.ok(
        weight(selector) > theirs,
        `${selector} doesn't outweigh CopilotKit's message rules`
      );
    }
  });

  test("keeps Arabic's 1.65 lines above 1025px, out-ranking the 24px", () => {
    const arabic = sizes(appSheet(), isMessage).filter(
      ([selector, , , atRule]) => atRule === WIDE && selector.startsWith(ARABIC)
    );
    assert.deepEqual(arabic, [
      [ARABIC + MESSAGE, 'line-height', '1.65', WIDE],
      [ARABIC + PARAGRAPH, 'line-height', '1.65', WIDE],
    ]);
    for (const [selector] of arabic) {
      const latin = selector.slice(ARABIC.length);
      assert.ok(
        weight(selector) > weight(latin),
        `${selector} doesn't outweigh ${latin}`
      );
    }
  });

  test('sets the message box at 15px above 1025px under a fine pointer only', () => {
    const app = sizes(appSheet(), isBox);
    const queried = app.filter(([, , , atRule]) => atRule !== null);
    assert.deepEqual(queried, [
      [
        '.agent .copilotKitInputContainer .copilotKitInput > textarea',
        'font-size',
        '15px',
        WIDE_FINE,
      ],
    ]);
    for (const [selector] of app.filter(([, , , atRule]) => atRule === null)) {
      assert.ok(
        weight(queried[0][0]) > weight(selector),
        `${queried[0][0]} doesn't outweigh ${selector}`
      );
    }
  });

  test("keeps the 16px message box and Arabic's 1.65 lines outside any query", () => {
    const app = appSheet();
    assert.deepEqual(
      sizes(app, isBox).filter(([, , , atRule]) => atRule === null),
      [
        [
          '.copilotKitInputContainer .copilotKitInput > textarea',
          'font-size',
          '1rem',
          null,
        ],
      ]
    );
    assert.deepEqual(
      sizes(app, isMessage).filter(([, , , atRule]) => atRule === null),
      [[`${ARABIC}.copilotKitMessage`, 'line-height', '1.65', null]]
    );
  });

  // Nested in the `.agent { }` block, a selector that already starts with
  // `.agent` compiles to `.agent .agent …` and matches nothing.
  test('names .agent at most once in every selector', () => {
    appSheet().walkRules((rule) => {
      for (const selector of rule.selectors.map(collapse)) {
        assert.ok(
          (selector.match(/\.agent(?![\w-])/g) || []).length <= 1,
          `${selector} names .agent twice`
        );
      }
    });
  });
});
