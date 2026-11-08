// 051 — channel panels. The classes the calendar's channel list rests on
// (channel.panel.tsx, inside split.panel.tsx at launches.component.tsx's
// w-[288px]), its top bar (filters.tsx), the ⋯ menu's hints
// (post.actions.menu.tsx), the build number in Settings
// (settings.component.tsx) and the post card's preview (calendar.post.card.tsx).
// A variant or arbitrary value that Tailwind can't use emits nothing and the
// page just doesn't change, so this file asserts what Tailwind emitted for each
// of them, with the project's own config (see emit.mjs). Each class is added
// here by the task that first uses it.
//
// The picture's 16px platform badge is sized by its width and height
// attributes, not a class, so it has nothing to emit.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { test } from 'node:test';
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
// (`:where(…)` for `rtl:`), a combinator or the end of a selector list. So
// `mobile:flex` doesn't also find `mobile:flex-1`.
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

// Asserts each class emitted, every rule it emitted sits in `atRule`, and each
// rule declares exactly what the table says. A class can emit the same rule
// twice (core's `ms-0` and tailwindcss-rtl's), so every rule is checked.
async function assertEmits(table, atRule) {
  const css = await emit(Object.keys(table));
  for (const [className, decls] of Object.entries(table)) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
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

// Every arbitrary value on the list, the page, the bar, the menu and Settings,
// outside any query.
const ARBITRARY = {
  // launches.component.tsx — the list's width in the SplitPanel
  'w-[288px]': [['width', '288px']],
  // split.panel.tsx — the icon rail's 64px; the scroller: no top padding, so
  // the list's sticky header sits at its top (C28), and at the sides the rows'
  // 8px, or the icon rail's 6px (px-[8px] and px-[6px], below)
  'w-[64px]': [['width', '64px']],
  'pb-[20px]': [['padding-bottom', '20px']],
  // the sheet's grab handle, 36px (w-[36px], below) by 4px, 8px under the top
  'h-[4px]': [['height', '4px']],
  'mt-[8px]': [['margin-top', '8px']],
  'rounded-[2px]': [['border-radius', '2px']],
  // channel.panel.tsx — the icon buttons and the row actions
  'w-[36px]': [['width', '36px']],
  'h-[36px]': [['height', '36px']],
  'min-h-[28px]': [['min-height', '28px']],
  'px-[6px]': px('padding', '6px'),
  'rounded-[6px]': [['border-radius', '6px']],
  'text-[12px]': [['font-size', '12px']],
  'font-[600]': [['font-weight', '600']],
  // the 36px picture, and its badge at the end corner
  'gap-[6px]': [['gap', '6px']],
  'rounded-[8px]': [['border-radius', '8px']],
  'min-w-[36px]': [['min-width', '36px']],
  'min-h-[36px]': [['min-height', '36px']],
  'bottom-[5px]': [['bottom', '5px']],
  '-end-[5px]': [['inset-inline-end', '-5px']],
  // the collapsed rail's red !, on the picture's corner at the start
  'top-[2px]': [['top', '2px']],
  '-start-[6px]': [['inset-inline-start', '-6px']],
  'w-[18px]': [['width', '18px']],
  'h-[18px]': [['height', '18px']],
  'text-[11px]': [['font-size', '11px']],
  // a row: 52px, its button, its name and its second line
  'min-h-[52px]': [['min-height', '52px']],
  'rounded-[10px]': [['border-radius', '10px']],
  'px-[8px]': px('padding', '8px'),
  'gap-[12px]': [['gap', '12px']],
  'py-[8px]': py('padding', '8px'),
  'gap-[1px]': [['gap', '1px']],
  'text-[14px]': [['font-size', '14px']],
  'font-[500]': [['font-weight', '500']],
  // a customer's header: its dot, its name, its pencil and its tick
  'gap-[2px]': [['gap', '2px']],
  'gap-[4px]': [['gap', '4px']],
  'gap-[8px]': [['gap', '8px']],
  'px-[4px]': px('padding', '4px'),
  'w-[8px]': [['width', '8px']],
  'h-[8px]': [['height', '8px']],
  'text-[13px]': [['font-size', '13px']],
  'w-[28px]': [['width', '28px']],
  'h-[28px]': [['height', '28px']],
  'w-[20px]': [['width', '20px']],
  'h-[20px]': [['height', '20px']],
  // the sticky header, its count and its hint; past SplitPanel's 8px, the
  // header's own 8px and 2px (4px on the sheet, below), the hint's 8px
  // (px-[8px], above) and the search's 4px
  'pt-[20px]': [['padding-top', '20px']],
  'ps-[8px]': [['padding-inline-start', '8px']],
  'pe-[2px]': [['padding-inline-end', '2px']],
  'mx-[4px]': px('margin', '4px'),
  'pb-[8px]': [['padding-bottom', '8px']],
  'text-[15px]': [['font-size', '15px']],
  'py-[1px]': py('padding', '1px'),
  'px-[12px]': px('padding', '12px'),
  'rounded-[4px]': [['border-radius', '4px']],
  // the search field, the empty list and the no-match line
  'start-[12px]': [['inset-inline-start', '12px']],
  'px-[34px]': px('padding', '34px'),
  'max-h-[500px]': [['max-height', '500px']],
  'text-[20px]': [['font-size', '20px']],
  'py-[24px]': py('padding', '24px'),
  'px-[16px]': px('padding', '16px'),
  // filters.tsx — the view pills, as wide as their words (px-[12px], above)
  // with 2px between them (gap-[2px], above), the state pills, Today and the
  // arrows
  'pt-[6px]': [['padding-top', '6px']],
  'pb-[5px]': [['padding-bottom', '5px']],
  'min-w-[80px]': [['min-width', '80px']],
  'h-[42px]': [['height', '42px']],
  'w-[42px]': [['width', '42px']],
  'px-[9px]': px('padding', '9px'),
  // the view button, its menu's blank tick, and the Channels chip
  'h-[44px]': [['height', '44px']],
  'px-[10px]': px('padding', '10px'),
  'w-[11px]': [['width', '11px']],
  '-ms-[10px]': [['margin-inline-start', '-10px']],
  // the date, the arrows' group and the week's range
  'ms-[6px]': [['margin-inline-start', '6px']],
  'text-[18px]': [['font-size', '18px']],
  'gap-[10px]': [['gap', '10px']],
  'min-w-[200px]': [['min-width', '200px']],
  'py-[3px]': py('padding', '3px'),
  'rounded-[5px]': [['border-radius', '5px']],
  'p-[4px]': [['padding', '4px']],
  // the notice, "9 of 10 channels · Show all"
  'min-h-[32px]': [['min-height', '32px']],
  // post.actions.menu.tsx — a hinted list, its 6px padding and 10px icon gap
  // (gap-[10px], above), and a hint's icon level with its label
  'min-w-[260px]': [['min-width', '260px']],
  'max-w-[270px]': [['max-width', '270px']],
  'p-[6px]': [['padding', '6px']],
  'mt-[2px]': [['margin-top', '2px']],
  // settings.component.tsx — the build number under Log out
  'mt-[5px]': [['margin-top', '5px']],
};

test('every arbitrary value of the list, its page and the top bar emits its one rule', async () => {
  await assertEmits(ARBITRARY, null);
});

// Every `mobile:` class, at 1025px and below.
const MOBILE_CLASSES = {
  // channel.panel.tsx — a row's 56px, the header's 17px and its 4px at the
  // end, the collapse control that leaves and Done that comes
  'mobile:min-h-[56px]': [['min-height', '56px']],
  'mobile:text-[17px]': [['font-size', '17px']],
  'mobile:pe-[4px]': [['padding-inline-end', '4px']],
  'mobile:hidden': [['display', 'none']],
  'mobile:flex': [['display', 'flex']],
  // filters.tsx — the two rows: the chip and Create Post first, the date row
  // after, cut to its whole width
  'mobile:order-1': [['order', '1']],
  'mobile:order-2': [['order', '2']],
  'mobile:order-3': [['order', '3']],
  'mobile:basis-full': [['flex-basis', '100%']],
  'mobile:flex-1': [['flex', '1 1 0%']],
  // the end group dissolves, so Create Post is the bar's own item there
  'mobile:contents': [['display', 'contents']],
  'mobile:flex-col': [['flex-direction', 'column']],
  'mobile:min-w-0': [['min-width', '0px']],
  'mobile:w-full': [['width', '100%']],
  // the date: no lead, smaller, cut with an ellipsis; the short and wide forms
  'mobile:ms-0': [['margin-inline-start', '0px']],
  'mobile:text-[15px]': [['font-size', '15px']],
  'mobile:truncate': [
    ['overflow', 'hidden'],
    ['text-overflow', 'ellipsis'],
    ['white-space', 'nowrap'],
  ],
  'mobile:inline': [['display', 'inline']],
  // Today and the arrows at 44px, the arrows' group and the week's range
  'mobile:h-[44px]': [['height', '44px']],
  'mobile:w-[44px]': [['width', '44px']],
  'mobile:px-0': px('padding', '0px'),
  'mobile:gap-[8px]': [['gap', '8px']],
  // the list states: a 44px row that scrolls, each segment taking its share
  'mobile:min-h-[44px]': [['min-height', '44px']],
  'mobile:overflow-x-auto': [['overflow-x', 'auto']],
  'mobile:py-0': py('padding', '0px'),
  'mobile:h-full': [['height', '100%']],
  'mobile:min-w-fit': [['min-width', 'fit-content']],
  'mobile:items-stretch': [['align-items', 'stretch']],
  'mobile:items-center': [['align-items', 'center']],
  'mobile:justify-center': [['justify-content', 'center']],
  'mobile:py-[4px]': py('padding', '4px'),
  'mobile:px-[8px]': px('padding', '8px'),
  'mobile:whitespace-nowrap': [['white-space', 'nowrap']],
  // split.panel.tsx — the sheet's surface, under its grab handle too
  'mobile:bg-newBgColorInner': [
    ['background-color', 'var(--new-bgColorInner)'],
  ],
};

test('every mobile: change emits, and only inside the mobile screen', async () => {
  await assertEmits(MOBILE_CLASSES, MOBILE);
});

// Every `coarse:` class: the 44px touch floors, the bar's 54px above 1025px,
// and the 16px field that keeps iOS from zooming.
const COARSE_CLASSES = {
  'coarse:w-[44px]': [['width', '44px']],
  'coarse:h-[44px]': [['height', '44px']],
  'coarse:min-w-[44px]': [['min-width', '44px']],
  'coarse:min-h-[44px]': [['min-height', '44px']],
  'coarse:h-[54px]': [['height', '54px']],
  'coarse:min-h-[54px]': [['min-height', '54px']],
  'coarse:text-[16px]': [['font-size', '16px']],
  // a customer's pencil, always shown on touch
  'coarse:opacity-100': [['opacity', '1']],
  // a view pill centres its label in the taller box
  'coarse:flex': [['display', 'flex']],
  'coarse:justify-center': [['justify-content', 'center']],
  'coarse:items-center': [['align-items', 'center']],
  // a customer's tick keeps its box at the 44px button's end, 4px in, on the
  // rows' Checks
  'coarse:justify-end': [['justify-content', 'flex-end']],
  'coarse:pe-[4px]': [['padding-inline-end', '4px']],
};

test('the touch sizes emit, and only under a coarse pointer', async () => {
  await assertEmits(COARSE_CLASSES, COARSE);
});

const TRANSFORM =
  'translate(var(--tw-translate-x), var(--tw-translate-y)) rotate(var(--tw-rotate)) skewX(var(--tw-skew-x)) skewY(var(--tw-skew-y)) scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y))';
const RTL = ':where([dir="rtl"], [dir="rtl"] *)';

const ring = (width) => [
  [
    '--tw-ring-offset-shadow',
    'var(--tw-ring-inset) 0 0 0 var(--tw-ring-offset-width) var(--tw-ring-offset-color)',
  ],
  [
    '--tw-ring-shadow',
    `var(--tw-ring-inset) 0 0 0 calc(${width} + var(--tw-ring-offset-width)) var(--tw-ring-color)`,
  ],
  [
    'box-shadow',
    'var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow, 0 0 #0000)',
  ],
];

test('the rtl: rotations emit, only in a right-to-left document', async () => {
  // A closed customer's chevron, the arrows, and the collapse control's icon.
  const table = {
    'rtl:rotate-90': [
      ['--tw-rotate', '90deg'],
      ['transform', TRANSFORM],
    ],
    'rtl:rotate-180': [
      ['--tw-rotate', '180deg'],
      ['transform', TRANSFORM],
    ],
    'rtl:-scale-x-100': [
      ['--tw-scale-x', '-1'],
      ['transform', TRANSFORM],
    ],
  };
  const css = await assertEmits(table, null);
  for (const className of Object.keys(table))
    for (const rule of rules(css, className))
      assert.equal(rule.selector, `.${className}${RTL}`);
});

test("a closed customer's chevron turns to the end in either direction", async () => {
  // `:where()` adds nothing, so the rtl: rule wins on order alone.
  const css = await emit(['-rotate-90', 'rtl:rotate-90']);
  const [ltr] = rules(css, '-rotate-90');
  const [rtl] = rules(css, 'rtl:rotate-90');
  assert.deepEqual(ltr.decls[0], ['--tw-rotate', '-90deg']);
  assert.ok(
    ltr.index < rtl.index,
    'rtl:rotate-90 is emitted before -rotate-90'
  );
});

test("the post card's preview aligns to the start of its own text", async () => {
  // The preview is dir="auto". tailwindcss-rtl adds a physical side for the
  // page's direction to core's text-start, which outranks it, so in the
  // Arabic calendar an English preview sat at the right and its ellipsis was
  // clipped (walk 2, step 9). The arbitrary property is the native start
  // alone, which resolves against the preview's own direction.
  const css = await emit(['text-start', '[text-align:start]']);
  const pick = ({ selector, atRule, decls }) => ({ selector, atRule, decls });
  assert.deepEqual(rules(css, '[text-align:start]').map(pick), [
    {
      selector: '.[text-align:start]',
      atRule: null,
      decls: [['text-align', 'start']],
    },
  ]);
  assert.deepEqual(
    rules(css, 'text-start')
      .map(pick)
      .filter(({ selector }) => selector.startsWith('[dir="rtl"]')),
    [
      {
        selector: '[dir="rtl"] .text-start',
        atRule: null,
        decls: [['text-align', 'right']],
      },
    ]
  );
});

// The week view from 1026px to 1279px (calendar.tsx's WeekView and
// WeekNowLine): each header's short weekday over its day number, and the
// phone's 72px hour column, its labels 12px on one line with 4px sides.
const NARROW_WEEK = '[@media(min-width:1026px)_and_(max-width:1279px)]:';

test('the narrow week emits, only between 1026px and 1279px', async () => {
  await assertEmits(
    {
      [`${NARROW_WEEK}hidden`]: [['display', 'none']],
      [`${NARROW_WEEK}inline`]: [['display', 'inline']],
      [`${NARROW_WEEK}[grid-template-columns:72px_repeat(7,_minmax(0,_1fr))]`]:
        [['grid-template-columns', '72px repeat(7, minmax(0, 1fr))']],
      [`${NARROW_WEEK}px-[4px]`]: px('padding', '4px'),
      [`${NARROW_WEEK}text-[12px]`]: [['font-size', '12px']],
      [`${NARROW_WEEK}whitespace-nowrap`]: [['white-space', 'nowrap']],
      [`${NARROW_WEEK}w-[72px]`]: [['width', '72px']],
    },
    '(min-width:1026px) and (max-width:1279px)'
  );
});

test('the narrow week is emitted after the rules it replaces, and a max-width one would replace the phone’s', async () => {
  const css = await emit([
    'hidden',
    `${NARROW_WEEK}inline`,
    '[grid-template-columns:136px_repeat(7,_minmax(0,_1fr))]',
    `${NARROW_WEEK}[grid-template-columns:72px_repeat(7,_minmax(0,_1fr))]`,
    'p-2',
    'pe-4',
    `${NARROW_WEEK}px-[4px]`,
    'text-[14px]',
    `${NARROW_WEEK}text-[12px]`,
    'w-[136px]',
    `${NARROW_WEEK}w-[72px]`,
    'mobile:[grid-template-columns:72px_repeat(7,_minmax(100px,_1fr))]',
    '[@media(max-width:1279px)]:[grid-template-columns:72px_repeat(7,_minmax(0,_1fr))]',
  ]);
  order(css, 'hidden', `${NARROW_WEEK}inline`);
  order(
    css,
    '[grid-template-columns:136px_repeat(7,_minmax(0,_1fr))]',
    `${NARROW_WEEK}[grid-template-columns:72px_repeat(7,_minmax(0,_1fr))]`
  );
  // pe-4 is padding-inline-end; the later physical padding takes its side
  order(css, 'p-2', `${NARROW_WEEK}px-[4px]`);
  order(css, 'pe-4', `${NARROW_WEEK}px-[4px]`);
  order(css, 'text-[14px]', `${NARROW_WEEK}text-[12px]`);
  order(css, 'w-[136px]', `${NARROW_WEEK}w-[72px]`);
  // Why a band: an arbitrary variant is emitted after every mobile: rule, so
  // [@media(max-width:1279px)]: would also replace the phone's 100px columns
  // and full headers at 1025px and below.
  order(
    css,
    'mobile:[grid-template-columns:72px_repeat(7,_minmax(100px,_1fr))]',
    '[@media(max-width:1279px)]:[grid-template-columns:72px_repeat(7,_minmax(0,_1fr))]'
  );
});

test('the states of the rows and controls emit, on the custom colours too', async () => {
  const table = {
    'focus-visible:ring-2': ring('2px'),
    'focus-visible:ring-brand': [['--tw-ring-color', 'var(--brand)']],
    'focus-visible:opacity-100': [['opacity', '1']],
    'group-hover:opacity-100': [['opacity', '1']],
    // a row's ⋯ (menu/menu.tsx's trigger), shown on its own focus and while
    // its menu, which opens inside the wrapper, is open
    'focus-within:opacity-100': [['opacity', '1']],
    'has-[[aria-expanded=true]]:opacity-100': [['opacity', '1']],
    'disabled:opacity-50': [['opacity', '0.5']],
    'hover:bg-surface2': [['background-color', 'var(--surface-2)']],
    'hover:bg-boxHover': [['background-color', 'var(--new-box-hover)']],
    'hover:bg-boxFocused': [['background-color', 'var(--new-boxFocused)']],
    'hover:text-ink': [['color', 'var(--ink)']],
    'hover:text-brandText': [['color', 'var(--brand-text)']],
    'hover:text-textItemFocused': [['color', 'var(--new-textItemFocused)']],
    'hover:underline': [['text-decoration-line', 'underline']],
    'placeholder:text-muted': [['color', 'var(--muted)']],
    // an empty search field takes the page's direction, not dir="auto"'s LTR
    'placeholder-shown:[direction:inherit]': [['direction', 'inherit']],
  };
  const css = await assertEmits(table, null);

  const selector = (className) => rules(css, className)[0].selector;
  assert.equal(
    selector('focus-visible:ring-2'),
    '.focus-visible:ring-2:focus-visible'
  );
  assert.equal(
    selector('group-hover:opacity-100'),
    '.group:hover .group-hover:opacity-100'
  );
  assert.equal(
    selector('focus-within:opacity-100'),
    '.focus-within:opacity-100:focus-within'
  );
  assert.equal(
    selector('has-[[aria-expanded=true]]:opacity-100'),
    '.has-[[aria-expanded=true]]:opacity-100:has([aria-expanded=true])'
  );
  assert.equal(
    selector('disabled:opacity-50'),
    '.disabled:opacity-50:disabled'
  );
  assert.equal(selector('hover:bg-boxHover'), '.hover:bg-boxHover:hover');
  assert.equal(
    selector('placeholder:text-muted'),
    '.placeholder:text-muted::placeholder'
  );
  assert.equal(
    selector('placeholder-shown:[direction:inherit]'),
    '.placeholder-shown:[direction:inherit]:placeholder-shown'
  );
});

test('every colour the list and the top bar name maps to its token', async () => {
  await assertEmits(
    {
      'text-muted': [['color', 'var(--muted)']],
      'text-ink': [['color', 'var(--ink)']],
      'text-inkSoft': [['color', 'var(--ink-soft)']],
      'text-error': [['color', 'var(--error)']],
      'text-brandText': [['color', 'var(--brand-text)']],
      'text-textColor': [['color', 'var(--new-btn-text)']],
      'text-btnText': [['color', 'var(--new-btn-text)']],
      'bg-surface2': [['background-color', 'var(--surface-2)']],
      'bg-brand': [['background-color', 'var(--brand)']],
      'bg-brandSoft': [['background-color', 'var(--brand-soft)']],
      'bg-quiet': [['background-color', 'var(--quiet)']],
      'bg-newBgColorInner': [['background-color', 'var(--new-bgColorInner)']],
      'bg-newTableBorder': [['background-color', 'var(--new-table-border)']],
      'bg-btnSimple': [['background-color', 'var(--new-btn-simple)']],
      'border-line': [['border-color', 'var(--line)']],
      // the sheet's grab handle
      'bg-line': [['background-color', 'var(--line)']],
      'border-brand': [['border-color', 'var(--brand)']],
      'border-muted': [['border-color', 'var(--muted)']],
      'border-fifth': [['border-color', 'var(--color-fifth)']],
      'border-newTableBorder': [['border-color', 'var(--new-table-border)']],
      'border-btnSimple': [['border-color', 'var(--new-btn-simple)']],
      // a channel dropped on a customer
      'ring-brand': [['--tw-ring-color', 'var(--brand)']],
      // a customer's dot (helpers/customer-hue.ts)
      'bg-catPomegranate': [['background-color', 'var(--cat-pomegranate)']],
      'bg-catSaffron': [['background-color', 'var(--cat-saffron)']],
      'bg-catFayrouz': [['background-color', 'var(--cat-fayrouz)']],
      'bg-catPalm': [['background-color', 'var(--cat-palm)']],
      'bg-catLapis': [['background-color', 'var(--cat-lapis)']],
      'bg-catMulberry': [['background-color', 'var(--cat-mulberry)']],
    },
    null
  );
});

test('the core forms the list, the menu and the card lean on emit', async () => {
  await assertEmits(
    {
      // the post card's preview, one line (R10)
      'line-clamp-1': [
        ['overflow', 'hidden'],
        ['display', '-webkit-box'],
        ['-webkit-box-orient', 'vertical'],
        ['-webkit-line-clamp', '1'],
      ],
      // the menu's list stays on one line, and a hint wraps inside it
      'text-nowrap': [['text-wrap', 'nowrap']],
      'text-wrap': [['text-wrap', 'wrap']],
      // the build number wraps anywhere, never cut (R11)
      'break-all': [['word-break', 'break-all']],
      // a hidden row's picture (C25)
      grayscale: [
        ['--tw-grayscale', 'grayscale(100%)'],
        [
          'filter',
          'var(--tw-blur) var(--tw-brightness) var(--tw-contrast) var(--tw-grayscale) var(--tw-hue-rotate) var(--tw-invert) var(--tw-saturate) var(--tw-sepia) var(--tw-drop-shadow)',
        ],
      ],
      // a channel dropped on a customer
      'ring-1': ring('1px'),
      'ring-inset': [['--tw-ring-inset', 'inset']],
      'underline-offset-2': [['text-underline-offset', '2px']],
    },
    null
  );
});

// The later of two rules at one specificity wins, so each override has to be
// emitted after the rule it replaces.
const order = (css, earlier, later) => {
  const [first] = rules(css, earlier);
  const [second] = rules(css, later);
  assert.ok(first && second, `${earlier} or ${later} emitted no CSS`);
  assert.ok(
    first.index < second.index,
    `${later} is emitted before ${earlier}, so ${earlier} wins`
  );
};

test('each small-screen and touch change is emitted after the rule it replaces', async () => {
  const pairs = [
    ['min-h-[52px]', 'mobile:min-h-[56px]'],
    ['text-[15px]', 'mobile:text-[17px]'],
    ['pe-[2px]', 'mobile:pe-[4px]'],
    ['flex', 'mobile:hidden'],
    ['hidden', 'mobile:flex'],
    // the bar's end group, and Create Post's box in it, on a phone
    ['flex', 'mobile:contents'],
    ['shrink-0', 'mobile:flex-1'],
    ['ms-[6px]', 'mobile:ms-0'],
    ['text-[18px]', 'mobile:text-[15px]'],
    ['h-[42px]', 'mobile:h-[44px]'],
    ['w-[42px]', 'mobile:w-[44px]'],
    ['px-[9px]', 'mobile:px-0'],
    ['min-w-[200px]', 'mobile:min-w-0'],
    ['gap-[10px]', 'mobile:gap-[8px]'],
    ['w-[36px]', 'coarse:w-[44px]'],
    ['justify-center', 'coarse:justify-end'],
    ['h-[36px]', 'coarse:h-[44px]'],
    ['min-h-[28px]', 'coarse:min-h-[44px]'],
    ['h-[42px]', 'coarse:h-[54px]'],
    ['text-[14px]', 'coarse:text-[16px]'],
    ['opacity-0', 'coarse:opacity-100'],
    ['opacity-0', 'group-hover:opacity-100'],
    ['opacity-0', 'focus-visible:opacity-100'],
    ['opacity-0', 'focus-within:opacity-100'],
    ['opacity-0', 'has-[[aria-expanded=true]]:opacity-100'],
  ];
  const css = await emit(pairs.flat());
  for (const [earlier, later] of pairs) order(css, earlier, later);
});

test("coarse: is emitted before mobile:, so a phone's bar is 44px and not 54px", async () => {
  // Today, the arrows and the list states are 54px on a touch screen above
  // 1025px; a touch phone matches both queries, and the mobile: rule has to win.
  const css = await emit([
    'coarse:h-[54px]',
    'mobile:h-[44px]',
    'coarse:min-h-[54px]',
    'mobile:min-h-[44px]',
  ]);
  order(css, 'coarse:h-[54px]', 'mobile:h-[44px]');
  order(css, 'coarse:min-h-[54px]', 'mobile:min-h-[44px]');
});
