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
// tool switcher (studio/tool.switcher.tsx). The `page` layout sets its
// settings panel at the start side and stacks under phone: (stage first at the
// stacked stage's height); at 1025px and below it takes its natural height, so
// its bar is pinned to the bottom there; the `stacked` layout is the stacked
// stage everywhere. The rest is asserted elsewhere: [container-type:size] on
// the stage in Part 1; motion-safe:animate-pulse on StageProgress's box in
// samy-images; phone:hidden, phone:flex-col and phone:w-full in shell-studio;
// mobile:h-auto in channel-panels; the bar's px-[20px] in dashboard-polish and
// its mobile:-mx-[16px], mobile:-mb-[16px] and mobile:px-[16px] in emit;
// ChoiceField's mobile:min-w-0 and mobile:px-[8px], p-[4px], px-[12px],
// gap-[10px], text-[12px], text-[14px], font-[600] and the focus ring in
// channel-panels and others; the coarse:min-h-[44px], coarse:h-[44px],
// coarse:w-[44px] and coarse:min-w-[44px] sizes in emit and others; the
// switcher's w-[340px] in shell-studio and its picture's [&_svg]:size-4 in
// brands-from-channels; the slot's contents in emit. A size that follows the
// picked shape is an inline style, not a class.
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
      },
      '(max-width: 768px)'
    );
  });

  test("the page's action bar is fixed to the foot of the screen at 1025px and below, where the page scrolls and the page card clips, with room kept under the page as tall as the bar", async () => {
    await assertEmits(
      {
        'mobile:fixed': [['position', 'fixed']],
        'mobile:inset-x-0': [
          ['left', '0px'],
          ['right', '0px'],
        ],
        'mobile:bottom-0': [['bottom', '0px']],
        // above the page, under every popup (100 and up) and the menu
        // drawer's scrim (180)
        'mobile:z-[90]': [['z-index', '90']],
        // the bar no longer reaches past the panel's padding: it spans the
        // screen
        'mobile:m-0': [['margin', '0px']],
        // clear of the home indicator, as the composer's tool bar is
        'mobile:pb-[calc(16px+env(safe-area-inset-bottom))]': [
          ['padding-bottom', 'calc(16px + env(safe-area-inset-bottom))'],
        ],
        // the room under the page: the bar's one row from 769px
        'mobile:pb-[calc(77px+env(safe-area-inset-bottom))]': [
          ['padding-bottom', 'calc(77px + env(safe-area-inset-bottom))'],
        ],
      },
      '(max-width: 1025px)'
    );
  });

  test("on a phone the room under the page is the bar's two rows, and is emitted after the one-row room so it wins there", async () => {
    await assertEmits(
      {
        'phone:pb-[calc(113px+env(safe-area-inset-bottom))]': [
          ['padding-bottom', 'calc(113px + env(safe-area-inset-bottom))'],
        ],
      },
      '(max-width: 768px)'
    );
    const one = 'mobile:pb-[calc(77px+env(safe-area-inset-bottom))]';
    const two = 'phone:pb-[calc(113px+env(safe-area-inset-bottom))]';
    const css = await emit([one, two]);
    const [wide] = rules(css, one);
    const [narrow] = rules(css, two);
    assert.ok(
      wide && narrow && wide.index < narrow.index,
      `${two} must be emitted after ${one}`
    );
  });

  test("a window's scroller keeps no ring room under its bar: pb-0 is emitted after p-[4px], outside any query", async () => {
    const css = await assertEmits(
      {
        'p-[4px]': [['padding', '4px']],
        'pb-0': [['padding-bottom', '0px']],
      },
      null
    );
    const [all] = rules(css, 'p-[4px]');
    const [foot] = rules(css, 'pb-0');
    assert.ok(all.index < foot.index, 'pb-0 must be emitted after p-[4px]');
  });

  test("on a phone the page's stage and its result's room stop being size containers, and the result takes the full width over its box's inline width", async () => {
    const css = await assertEmits(
      {
        'phone:[container-type:normal]': [['container-type', 'normal']],
        'phone:!w-full': [['width', '100%']],
      },
      '(max-width: 768px)'
    );
    // The box sets its width inline; only !important outranks it.
    const important = [];
    postcss.parse(css).walkDecls('width', (decl) => {
      if (names(unescape(decl.parent.selector), 'phone:!w-full')) {
        important.push(decl.important);
      }
    });
    assert.deepEqual(important, [true], 'phone:!w-full must be !important');
  });

  test("in a window or a tab the stage and its result's room stop being size containers at every width, and the result takes the full width over its box's inline width, outside any query", async () => {
    const css = await assertEmits(
      {
        '[container-type:normal]': [['container-type', 'normal']],
        '!w-full': [['width', '100%']],
      },
      null
    );
    // The box sets its width inline; only !important outranks it.
    const important = [];
    postcss.parse(css).walkDecls('width', (decl) => {
      if (names(unescape(decl.parent.selector), '!w-full')) {
        important.push(decl.important);
      }
    });
    assert.deepEqual(important, [true], '!w-full must be !important');
  });

  test("the page's action bar reaches past the panel's 20px padding to both edges and its foot, and each mobile: tier is emitted after it", async () => {
    // Symmetric, so the physical pair -mx- emits is the same at either end.
    await assertEmits(
      {
        '-mx-[20px]': [
          ['margin-left', '-20px'],
          ['margin-right', '-20px'],
        ],
        '-mb-[20px]': [['margin-bottom', '-20px']],
      },
      null
    );
    // Equal specificity on one element: the later rule wins inside the
    // query, so a mobile: tier emitted first would leave the fixed bar 20px
    // past the screen's edges, or without its home-indicator room, at 1025px
    // and below.
    const pairs = [
      ['-mx-[20px]', 'mobile:m-0'],
      ['-mb-[20px]', 'mobile:m-0'],
      ['px-[20px]', 'mobile:px-[16px]'],
      ['py-[16px]', 'mobile:pb-[calc(16px+env(safe-area-inset-bottom))]'],
    ];
    const css = await emit(pairs.flat());
    for (const [desktop, small] of pairs) {
      const [wide] = rules(css, desktop);
      const [narrow] = rules(css, small);
      assert.ok(
        wide && narrow && wide.index < narrow.index,
        `${small} must be emitted after ${desktop}`
      );
    }
  });

  test("the sample's 16:9 picture takes the largest box its room allows up to 640px, and the style catalogue and the edit bar keep to 640px, outside any query", async () => {
    // StageSample's room is a size container, so 100cqw and 100cqh are its
    // content box. Tailwind spaces calc()'s operators; min()'s commas stay.
    await assertEmits(
      {
        'w-[min(100cqw,calc(100cqh*16/9),640px)]': [
          ['width', 'min(100cqw,calc(100cqh * 16 / 9),640px)'],
        ],
        'max-w-[640px]': [['max-width', '640px']],
      },
      null
    );
  });

  test("the tool switcher's trigger, its picture and its list keep their sizes, outside any query", async () => {
    await assertEmits(
      {
        // the trigger, set off from the page title before it
        'ms-[12px]': [['margin-inline-start', '12px']],
        'max-w-[320px]': [['max-width', '320px']],
        // a listing's picture, a 16:9 strip of its cover
        'h-[27px]': [['height', '27px']],
        // the list, never wider than the screen less its margins
        'max-w-[calc(100vw-20px)]': [['max-width', 'calc(100vw - 20px)']],
      },
      null
    );
  });

  test("on a phone the page title gives way to a top-bar slot that holds something, and the tool switcher sits at the slot's start, its name on up to two lines in place of its picture", async () => {
    const css = await assertEmits(
      {
        // the title's h1, hidden while the slot after it holds the switcher
        'phone:has-[+#top-bar-slot:not(:empty)]:hidden': [['display', 'none']],
        // the switcher, no longer set off from a title that is not there
        'phone:ms-0': [['margin-inline-start', '0px']],
        // and without its picture, its name on up to two lines
        'phone:hidden': [['display', 'none']],
        'phone:ps-[10px]': [['padding-inline-start', '10px']],
        'phone:whitespace-normal': [['white-space', 'normal']],
        'phone:line-clamp-2': [
          ['overflow', 'hidden'],
          ['display', '-webkit-box'],
          ['-webkit-box-orient', 'vertical'],
          ['-webkit-line-clamp', '2'],
        ],
        'phone:text-[13px]': [['font-size', '13px']],
        'phone:leading-[16px]': [['line-height', '16px']],
      },
      '(max-width: 768px)'
    );
    const [title] = rules(css, 'phone:has-[+#top-bar-slot:not(:empty)]:hidden');
    assert.ok(
      title.selector.endsWith(':has(+#top-bar-slot:not(:empty))'),
      `the title's rule must apply only beside a slot that holds something: "${title.selector}"`
    );
  });

  test("the running step's ring turns only when motion is welcome", async () => {
    await assertEmits(
      {
        'motion-safe:animate-spin': [['animation', 'spin 1s linear infinite']],
      },
      '(prefers-reduced-motion: no-preference)'
    );
  });
});

// The composer's frame (new-launch/manage.modal.tsx) and its stage
// (new-launch/composer.stage.tsx). The root takes the shell's insets in place
// of its 40px padding, so at desktop width the card covers exactly the Studio
// page's card, with its 12px corners on the card, the left header and the tab
// strip; at 1025px and below the composer fills the screen, and an active AI
// tab is a layer over it. The rest is asserted elsewhere: the layer's
// mobile:fixed and the busy tab's motion-safe:animate-spin in Part 2; the
// pending placeholder's motion-safe:animate-pulse in samy-images and its
// bg-surface2 in channel-panels and others; the layer's bg-newBgColorInner in
// channel-panels and dashboard-polish; its Back chevron's rtl:rotate-180 in
// channel-panels; hidden in channel-panels and emit, mobile:hidden in
// shell-studio and others.
describe('Part 3: the composer', () => {
  test("the composer's insets and its card's, left header's and tab strip's corners emit their one rule, outside any query", async () => {
    await assertEmits(
      {
        // the root, inside the shell's rail and top bar
        'ps-[100px]': [['padding-inline-start', '100px']],
        'pe-[12px]': [['padding-inline-end', '12px']],
        'py-[12px]': [
          ['padding-top', '12px'],
          ['padding-bottom', '12px'],
        ],
        // the card, as the Studio page's card
        'rounded-[12px]': [['border-radius', '12px']],
        // the left header on the start side, the tab strip on the end side
        'rounded-s-[12px]': [
          ['border-start-start-radius', '12px'],
          ['border-end-start-radius', '12px'],
        ],
        'rounded-e-[12px]': [
          ['border-start-end-radius', '12px'],
          ['border-end-end-radius', '12px'],
        ],
      },
      null
    );
  });

  test('at 1025px and below the composer drops its insets and its corners, and each mobile: form is emitted after what it replaces', async () => {
    await assertEmits(
      {
        'mobile:p-0': [['padding', '0px']],
        'mobile:rounded-none': [['border-radius', '0px']],
      },
      '(max-width: 1025px)'
    );
    // Equal specificity on one element: the later rule wins inside the
    // query, so a mobile: form emitted first would keep the shell's insets
    // or the card's corners on a full-screen composer.
    const pairs = [
      ['ps-[100px]', 'mobile:p-0'],
      ['pe-[12px]', 'mobile:p-0'],
      ['py-[12px]', 'mobile:p-0'],
      ['rounded-[12px]', 'mobile:rounded-none'],
    ];
    const css = await emit(pairs.flat());
    for (const [desktop, small] of pairs) {
      const [wide] = rules(css, desktop);
      const [narrow] = rules(css, small);
      assert.ok(
        wide && narrow && wide.index < narrow.index,
        `${small} must be emitted after ${desktop}`
      );
    }
  });

  test('at 1025px and below an active AI tab is a layer over the whole screen, above the composer', async () => {
    await assertEmits(
      {
        'mobile:inset-0': [['inset', '0px']],
        'mobile:z-[600]': [['z-index', '600']],
      },
      '(max-width: 1025px)'
    );
  });

  test("from 1026px up the composer's Assistant sits above the bottom bar, over CopilotKit's own bottom", async () => {
    const css = await assertEmits(
      {
        '[@media(min-width:1026px)]:!bottom-[112px]': [['bottom', '112px']],
      },
      '(min-width:1026px)'
    );
    // CopilotKit's sheet loads after ours; only !important outranks it.
    const important = [];
    postcss.parse(css).walkDecls('bottom', (decl) => {
      if (
        names(
          unescape(decl.parent.selector),
          '[@media(min-width:1026px)]:!bottom-[112px]'
        )
      ) {
        important.push(decl.important);
      }
    });
    assert.deepEqual(
      important,
      [true],
      '[@media(min-width:1026px)]:!bottom-[112px] must be !important'
    );
  });

  // While an AI tab is on screen the Assistant, button and window, is gone at
  // every width: CopilotKit's sheet sets no display on its popup, so the plain
  // rule holds.
  test("while an AI tab is on screen the composer's Assistant is gone at every width", async () => {
    await assertEmits({ hidden: [['display', 'none']] }, null);
  });
  // The stage's panel tint and its dot grid (FR-010): both read the theme's
  // tokens, so one class set serves both themes.
  test('the stage dot grid and tint emit in both themes', async () => {
    await assertEmits(
      {
        'bg-[var(--panel)]': [['background-color', 'var(--panel)']],
        '[background-image:radial-gradient(color-mix(in_srgb,var(--ink)_7%,transparent)_1px,transparent_1px)]':
          [
            [
              'background-image',
              'radial-gradient(color-mix(in srgb,var(--ink) 7%,transparent) 1px,transparent 1px)',
            ],
          ],
        '[background-size:20px_20px]': [['background-size', '20px 20px']],
      },
      null
    );
  });
  // The hub's cards share the row (FR-011): one auto-fill grid, 280px a card.
  test('minmax(280px,1fr) grid emits', async () => {
    await assertEmits(
      {
        'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]': [
          ['grid-template-columns', 'repeat(auto-fill,minmax(280px,1fr))'],
        ],
      },
      null
    );
  });
});
