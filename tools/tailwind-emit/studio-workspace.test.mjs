// 061 — the Studio workspace, the composer frame and the Post preview fit, in
// three parts. Part 1 fits Post preview's phone-width preview into its column
// (new-launch/preview.fit.tsx), gives Instagram's slider a box of its
// first slide's shape (new-launch/providers/instagram/instagram.preview.tsx)
// and fits TikTok's phone frame beside its icons
// (new-launch/providers/tiktok/tiktok.preview.tsx); part 2 puts Studio's tools on the workspace frame; part 3 puts AI Image and
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
// Instagram's slider, drawn at the shape its preview sets in --ig-ratio
// (aspect-[var(--ig-ratio)]). h-full, relative and absolute are
// channel-panels' order cases; top-0 and start-0 are asserted in
// media-library and others.
describe('Part 1: the preview fit', () => {
  test("the sizer's and Instagram's slider's own forms emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the sizer, centred in Post preview's column
        'mx-auto': [
          ['margin-left', 'auto'],
          ['margin-right', 'auto'],
        ],
        // Instagram's slider, in its first slide's shape
        'aspect-[var(--ig-ratio)]': [['aspect-ratio', 'var(--ig-ratio)']],
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

  test("TikTok's phone frame and icon column take the largest 9:16 height that leaves the icons their room, outside any query", async () => {
    // The preview's root is a size container, so 100cqw and 100cqh are its
    // content box for the frame and the icon column inside it. 47px is the
    // column's ml-[18px] and its 29px icons. calc() needs the spaces around
    // the -, and Tailwind writes them.
    await assertEmits(
      {
        '[container-type:size]': [['container-type', 'size']],
        'h-[min(100cqh,(100cqw-47px)*16/9)]': [
          ['height', 'min(100cqh,(100cqw - 47px) * 16 / 9)'],
        ],
      },
      null
    );
  });
});

// The workspace frame (studio/workspace.frame.tsx), its action bar, stage and
// field parts (studio/workspace.fields.tsx), and the top bar's slot for the
// tool switcher. The `page` layout sets its settings panel at the start side
// and stacks under phone: (stage first at the stacked stage's height, the bar
// pinned to the bottom); the `stacked` layout is the stacked stage everywhere.
// The rest is asserted elsewhere: [container-type:size] on the stage in Part
// 1; motion-safe:animate-pulse on StageProgress's box in samy-images;
// phone:hidden, phone:flex-col and phone:w-full in shell-studio;
// mobile:h-auto in channel-panels; ChoiceField's mobile:min-w-0 and
// mobile:px-[8px], p-[4px], px-[12px], gap-[10px], text-[12px], text-[14px],
// font-[600] and the focus ring in channel-panels and others; the
// coarse:min-h-[44px], coarse:h-[44px], coarse:w-[44px] and coarse:min-w-[44px]
// sizes in emit and others; the slot's contents in emit. A size that follows
// the picked shape is an inline style, not a class.
describe('Part 2: the workspace', () => {
  test("the page panel's width and end border, the stacked stage's height, the credits pill and the settings scroller's ring room emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the settings panel, on the start side of the page layout
        'w-[360px]': [['width', '360px']],
        'border-e': [['border-inline-end-width', '1px']],
        // the stage, first in the stacked layout
        'h-[clamp(240px,45dvh,440px)]': [
          ['height', 'clamp(240px,45dvh,440px)'],
        ],
        // CreditsPill, moved from the window header into the bar
        'py-[4px]': [
          ['padding-top', '4px'],
          ['padding-bottom', '4px'],
        ],
        // the settings scroller hands back the p-[4px] it keeps for a
        // field's 2px focus ring, as the video tool's scroller does
        '-m-[4px]': [['margin', '-4px']],
      },
      null
    );
  });

  test('every phone: class that stacks the page layout emits, and only inside the phone screen', async () => {
    await assertEmits(
      {
        // the folded Settings row, hidden beside the stage
        'phone:flex': [['display', 'flex']],
        // the stage: first, at the stacked stage's height, not stretched
        'phone:order-first': [['order', '-9999']],
        'phone:flex-none': [['flex', 'none']],
        'phone:h-[clamp(240px,45dvh,440px)]': [
          ['height', 'clamp(240px,45dvh,440px)'],
        ],
        // the settings panel loses its end border once it spans the width
        'phone:border-e-0': [['border-inline-end-width', '0px']],
        // the action bar, pinned to the bottom as the window scrolls
        'phone:sticky': [['position', 'sticky']],
        'phone:bottom-0': [['bottom', '0px']],
      },
      '(max-width: 768px)'
    );
  });
});
