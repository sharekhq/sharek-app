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

// Samy's welcome (agents/agent.welcome.tsx) is CopilotChat's
// RenderSuggestionsList, drawn straight inside footer.copilotKitMessagesFooter,
// the second child of the scrolling .copilotKitMessages column. Auto block
// margins centre it in the room the empty messages leave; CopilotKit's own
// footer rule, which the app loads after global.scss, sets
// `margin: 8px auto 0 auto`, so global.scss's rule must outrank it by
// specificity. This describe reads global.scss itself, as that is no class.
describe("Samy's welcome", () => {
  const require = createRequire(import.meta.url);
  const FOOTER = '.copilotKitMessagesFooter';
  // Classes and attributes; `:has()` weighs as its argument.
  const weight = (selector) => (selector.match(/[.[]/g) || []).length;
  // The compound a selector styles: its last, once `(…)` arguments are gone.
  const subject = (selector) =>
    selector
      .replace(/\([^()]*\)/g, '')
      .split(/[\s>+~]+/)
      .pop();
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
    const vendor = footerMargins(
      postcss.parse(
        readFileSync(require.resolve('@copilotkit/react-ui/styles.css'), 'utf8')
      )
    );
    assert.deepEqual(
      vendor.map(([selector, decl]) => [selector, decl.prop, decl.value]),
      [[FOOTER, 'margin', '8px auto 0 auto']],
      `CopilotKit's ${FOOTER} margin changed; re-check design note D4`
    );

    const app = footerMargins(
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
      )
    );
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
