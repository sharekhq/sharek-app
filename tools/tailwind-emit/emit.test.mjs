// Tests that the class forms this feature depends on actually emit CSS. Run
// them with:
//
//   node --test 'tools/tailwind-emit/*.test.mjs'
//
// Node's built-in runner, matching tools/responsive-probe. Pass the glob, not
// the directory: since Node 22.6 a positional is a glob pattern, and a bare
// directory matches nothing.
//
// Why this exists. A mistyped Tailwind variant does not fail — it emits
// nothing, silently, and the page looks exactly as it did. `coarse:` is
// registered by hand at tailwind.config.cjs:263 and is not `pointer-coarse:`;
// `mobile:` is a raw screen, and the calendar's whole layout change rests on a
// `mobile:` variant of an *arbitrary property*, the one form most likely to be
// dropped. Asserting the emitted CSS is the only way to see any of that.
//
// The expectations below are specs/016-responsive-primitives/quickstart.md
// step 1, which is R4's assertion promoted to a checked-in fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

// The five forms, and the one declaration each must produce inside the one
// at-rule each must sit in. `params` is matched after collapsing whitespace,
// because Tailwind's own spacing inside a media query is not the contract.
const FORMS = [
  {
    className: 'mobile:sticky',
    atRule: '(max-width: 1025px)',
    prop: 'position',
    value: 'sticky',
  },
  {
    // Logical, not `left` — see the dir-scoped test below for the rest of the
    // story, because this is not the only rule `start-0` ships.
    className: 'mobile:start-0',
    atRule: '(max-width: 1025px)',
    prop: 'inset-inline-start',
    value: '0px',
  },
  {
    className: 'mobile:[grid-template-columns:44px_repeat(7,_minmax(58px,_1fr))]',
    atRule: '(max-width: 1025px)',
    prop: 'grid-template-columns',
    value: '44px repeat(7, minmax(58px, 1fr))',
  },
  {
    className: 'coarse:min-h-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'min-height',
    value: '44px',
  },
  {
    className: 'coarse:min-w-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'min-width',
    value: '44px',
  },
  {
    // The modal's floor, which has to yield to a narrower viewport. A minimum
    // is the one clamp CSS applies last, so it cannot be capped from outside
    // by a max-width — the yielding has to happen inside the value, and an
    // arbitrary value carrying a comma is the form most likely to be dropped.
    className: 'min-w-[min(600px,100%)]',
    atRule: null,
    prop: 'min-width',
    value: 'min(600px,100%)',
  },
  {
    // The touch floor on a control whose height is already declared: a
    // `min-height` would lose to it, so the coarse rule has to set `height`.
    className: 'coarse:h-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'height',
    value: '44px',
  },
  {
    // TT2 — 16px is the size below which iOS Safari zooms a focused field.
    // Arbitrary font sizes emit no paired line-height, which is why this is
    // asserted as exactly one declaration.
    className: 'coarse:text-[16px]',
    atRule: '(pointer: coarse)',
    prop: 'font-size',
    value: '16px',
  },
  {
    // TT8's reveal. A control kept `hidden` until hover has to be shown
    // outright where there is no hover — which works only because the coarse
    // rule is emitted after the `hidden` it has to beat, asserted separately
    // below. Two classes at the same specificity are decided by order alone.
    className: 'coarse:block',
    atRule: '(pointer: coarse)',
    prop: 'display',
    value: 'block',
  },
  {
    // Its counterpart: where a reveal takes a row's space, whatever the row
    // showed instead has to give it up under the same pointer.
    className: 'coarse:hidden',
    atRule: '(pointer: coarse)',
    prop: 'display',
    value: 'none',
  },
  {
    className: 'coarse:opacity-100',
    atRule: '(pointer: coarse)',
    prop: 'opacity',
    value: '1',
  },
  {
    // The calendar's post actions are revealed into a strip that is a hard
    // 24px tall, so the reveal alone left them at 15x15. The box has to become
    // a flex centre to hold a 44px target without resizing the glyph — and
    // `coarse:flex` replaces `coarse:block` rather than joining it, because two
    // display utilities under the same at-rule are decided by emission order
    // and not by which one the author wrote last.
    className: 'coarse:flex',
    atRule: '(pointer: coarse)',
    prop: 'display',
    value: 'flex',
  },
  {
    // The strip that contains them is pinned by three declarations, not one:
    // a `min-height` alone loses to the `max-height` sitting beside it.
    className: 'coarse:max-h-[44px]',
    atRule: '(pointer: coarse)',
    prop: 'max-height',
    value: '44px',
  },
  {
    // Revealing an `opacity-0` control is only half of it. The ones hanging
    // over a media tile are `pointer-events-none` as well, and a control that
    // is visible but cannot be tapped is worse than one that is hidden.
    className: 'coarse:pointer-events-auto',
    atRule: '(pointer: coarse)',
    prop: 'pointer-events',
    value: 'auto',
  },
];

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

// Every declaration Tailwind emitted for `className` *on its own*, paired with
// the media query it landed in. Selectors are compared by their unescaped
// class, so the test never has to spell `\2c ` or `\[` and stays readable.
//
// Rules where the class is qualified by something else — `[dir="rtl"] .x` — are
// deliberately not counted here. They are a different claim and get their own
// test; folding them in would make every assertion below depend on which
// plugins happen to be installed.
function emitted(css, className, { qualifier = null, pseudo = null } = {}) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    const classes = rule.selector
      .split(',')
      .map((sel) => sel.trim())
      .filter((sel) => (qualifier ? sel.startsWith(`${qualifier} .`) : sel.startsWith('.')))
      .map((sel) => sel.slice(qualifier ? qualifier.length + 2 : 1))
      .map((sel) => sel.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)))
      // A variant that is a pseudo-class rather than a media query leaves it on
      // the selector — `hover:border-x` emits `.hover\:border-x:hover` — and the
      // unescaped class no longer equals the one asked for. Named by the caller
      // rather than stripped blindly, so a variant that emitted the wrong pseudo
      // still fails.
      .map((sel) => (pseudo && sel.endsWith(pseudo) ? sel.slice(0, -pseudo.length) : sel));
    if (!classes.includes(className)) return;
    const atRule = rule.parent?.type === 'atrule' ? collapse(rule.parent.params) : null;
    rule.walkDecls((decl) => found.push({ atRule, prop: decl.prop, value: collapse(decl.value) }));
  });
  return found;
}

test('every class form this feature depends on emits CSS', async () => {
  const css = await emit(FORMS.map((f) => f.className));

  for (const form of FORMS) {
    const decls = emitted(css, form.className);

    // The failure this file exists for: a variant that emits nothing at all.
    assert.ok(
      decls.length > 0,
      `${form.className} emitted no CSS — the variant or the arbitrary value was dropped, not applied`
    );

    assert.deepEqual(
      decls,
      [{ atRule: form.atRule, prop: form.prop, value: form.value }],
      `${form.className} did not emit exactly ${form.prop}: ${form.value} inside @media ${form.atRule}`
    );
  }
});

test('start-0 also ships the physical pair tailwindcss-rtl adds, and they agree with the logical one', async () => {
  // The plugin emits `[dir="ltr"] .x { left: 0 }` and `[dir="rtl"] .x { right: 0 }`
  // alongside the logical property, and those win on specificity wherever the
  // document declares a direction. That is not a problem — all three resolve to
  // the inline-start edge — but "one logical rule and nothing else" was wrong,
  // and a fixture that quietly filtered them out would keep saying so.
  const css = await emit(['mobile:start-0']);

  assert.deepEqual(emitted(css, 'mobile:start-0', { qualifier: '[dir="ltr"]' }), [
    { atRule: '(max-width: 1025px)', prop: 'left', value: '0px' },
  ]);
  assert.deepEqual(emitted(css, 'mobile:start-0', { qualifier: '[dir="rtl"]' }), [
    { atRule: '(max-width: 1025px)', prop: 'right', value: '0px' },
  ]);
});

test('border-s is a logical border, and no physical edge comes with it', async () => {
  // The paywall's two-column divider was `border-l` on an element whose padding
  // was already `ps-`. Under dir="rtl" the flex order reverses, the padding
  // follows and a physical border does not, so the line left the gap it marks
  // and sat against the outer edge of the screen.
  //
  // Asserted as "every declaration is the logical one" rather than as a single
  // entry, because tailwindcss-rtl emits `.border-s` alongside Tailwind's own
  // and both say the same thing — the `start-0` test above is the same shape.
  const css = await emit(['border-s']);
  const decls = emitted(css, 'border-s');

  assert.ok(decls.length > 0, 'border-s emitted no CSS at all');
  for (const decl of decls) {
    assert.deepEqual(decl, {
      atRule: null,
      prop: 'border-inline-start-width',
      value: '1px',
    });
  }

  // The claim that distinguishes the fix from the bug: nothing pins a side.
  assert.ok(
    !/border-(left|right)-width/.test(css),
    'border-s emitted a physical edge, which is what the fix exists to avoid'
  );
});

test('a variant that does not exist emits nothing, so the assertions above can fail', async () => {
  // The control. `pointer-coarse:` is the plausible misspelling of the
  // hand-registered `coarse:` variant — proof that emitted-CSS assertions
  // distinguish a working class from a silently dropped one.
  const css = await emit(['pointer-coarse:min-h-[44px]']);

  assert.deepEqual(emitted(css, 'pointer-coarse:min-h-[44px]'), []);
});

test('the tap-to-open variant emits, and hangs off the group rather than the panel', async () => {
  // The four hover-revealed *panels* cannot simply be shown under `coarse:` —
  // pinned open, an org list and a heading picker sit over the page for good.
  // They open on focus instead, which a tap gives them, and `focus-within` is
  // what carries a tap on the trigger down to the panel it reveals.
  //
  // The claim worth asserting is where the rule lands: on `.group:focus-within
  // .panel`, not on the panel alone. A rule that emitted on the panel itself
  // would open only while the panel already had focus — which it cannot get
  // while it is closed.
  const css = await emit([
    'group-focus-within:flex',
    'group-focus-within:opacity-100',
    'group-focus-within:pointer-events-auto',
  ]);

  const underGroup = (className) => emitted(css, className, { qualifier: '.group:focus-within' });

  assert.deepEqual(underGroup('group-focus-within:flex'), [
    { atRule: null, prop: 'display', value: 'flex' },
  ]);
  assert.deepEqual(underGroup('group-focus-within:opacity-100'), [
    { atRule: null, prop: 'opacity', value: '1' },
  ]);
  assert.deepEqual(underGroup('group-focus-within:pointer-events-auto'), [
    { atRule: null, prop: 'pointer-events', value: 'auto' },
  ]);

  // Nothing on the bare class: the whole rule is the descendant one above.
  assert.deepEqual(emitted(css, 'group-focus-within:flex'), []);
});

test('a coarse reveal is emitted after the base utility it has to beat', async () => {
  // `hidden coarse:block` on one element is two rules of equal specificity, so
  // the later one wins and order is the entire mechanism. It happens to hold
  // for every pair phase 6 relies on — but it holds because Tailwind emits
  // variants after plain utilities, not because anyone chose it, and a change
  // in that order would un-reveal every one of these controls silently.
  const pairs = [
    ['hidden', 'coarse:block'],
    ['block', 'coarse:hidden'],
    ['opacity-0', 'coarse:opacity-100'],
    ['pointer-events-none', 'coarse:pointer-events-auto'],
    ['group-hover:block', 'coarse:block'],
    ['hidden', 'coarse:flex'],
    ['group-hover:block', 'coarse:flex'],
  ];

  const css = await emit([...new Set(pairs.flat())]);
  const order = [];
  postcss.parse(css).walkRules((rule) => {
    order.push(
      rule.selector
        .replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch))
        .replace(/^\.group:hover /, '')
        .slice(1)
    );
  });

  for (const [base, override] of pairs) {
    assert.ok(
      order.indexOf(base) < order.indexOf(override),
      `${override} is emitted before ${base}, so the base utility wins and the control stays hidden under a coarse pointer`
    );
  }
});

test('a screen variant outranks the pointer variant, which is why the touch floor sometimes has to stack', async () => {
  // Both variants are media queries, so neither wins on specificity — the one
  // emitted later does. Tailwind puts the hand-registered `coarse` variant
  // *before* the screens, so `phone:min-w-0` beats `coarse:min-w-[44px]` at
  // exactly the width where a control is most likely to be too small to hit.
  // Anywhere that matters, the rule is written `phone:coarse:`, and this test
  // is what says that is still necessary.
  const css = await emit(['coarse:min-w-[44px]', 'phone:min-w-0', 'phone:coarse:min-w-[44px]']);
  const order = [];
  postcss.parse(css).walkRules((rule) => {
    const cls = rule.selector.replace(/\\([0-9a-f]{1,6}) ?|\\(.)/gi, (_, hex, ch) => (hex ? String.fromCodePoint(parseInt(hex, 16)) : ch)).slice(1);
    order.push(cls);
  });

  assert.deepEqual(order, [
    'coarse:min-w-[44px]',
    'phone:min-w-0',
    'phone:coarse:min-w-[44px]',
  ]);
});

// ---------------------------------------------------------------------------
// 026 — phone-width repair. Same contract as FORMS above, for the forms that
// batch introduces. Only the ones where silence is plausible are here: a plain
// `phone:hidden` cannot fail in a way this file would catch first.
// ---------------------------------------------------------------------------
const PHONE_WIDTH_FORMS = [
  {
    // The notification panel, clamped against the viewport it is anchored
    // inside. A nested function carrying a comma inside an arbitrary value is
    // the form most likely to be dropped, and `min-w-[min(600px,100%)]` above
    // is only the single-function case.
    className: 'phone:w-[min(420px,calc(100vw-24px))]',
    atRule: '(max-width: 768px)',
    prop: 'width',
    value: 'min(420px,calc(100vw - 24px))',
  },
  {
    // D3. The token nine call sites have always named and no config has ever
    // defined — in this repo or upstream — so those card bodies render with no
    // fill at all. This assertion is the whole of that fix.
    className: 'bg-newBgColorInnerInner',
    atRule: null,
    prop: 'background-color',
    value: 'var(--new-bgColorInner-inner)',
  },
  {
    // ai.image.tsx reaches for `newTextItemBlur`; the key is `textItemBlur`.
    // Asserted because the *first fix proposed* for it was itself a name that
    // does not exist, and nothing but this check noticed.
    className: 'text-textItemBlur',
    atRule: null,
    prop: 'color',
    value: 'var(--new-textItemBlur)',
  },
  {
    className: 'hover:border-textItemFocused',
    pseudo: ':hover',
    atRule: null,
    prop: 'border-color',
    value: 'var(--new-textItemFocused)',
  },
  {
    // The share page's comment box asks for `ring-ring`, which resolves to
    // nothing, so its ring falls back to Tailwind's default blue rather than
    // disappearing — a defect that looks like a design choice.
    className: 'focus-visible:ring-brand',
    pseudo: ':focus-visible',
    atRule: null,
    prop: '--tw-ring-color',
    value: 'var(--brand)',
  },
  {
    // D2. Four settings tables are one flat grid with no per-record element,
    // so stacking them rests entirely on a wrapper that is inert on desktop.
    className: 'contents',
    atRule: null,
    prop: 'display',
    value: 'contents',
  },
  {
    // The tutorial video stops deriving its width from its height.
    className: 'phone:aspect-video',
    atRule: '(max-width: 768px)',
    prop: 'aspect-ratio',
    value: '16 / 9',
  },
  {
    className: 'phone:min-h-[100px]',
    atRule: '(max-width: 768px)',
    prop: 'min-height',
    value: '100px',
  },
];

test('026: every class form the phone-width repair introduces emits CSS', async () => {
  const css = await emit(PHONE_WIDTH_FORMS.map((f) => f.className));

  for (const form of PHONE_WIDTH_FORMS) {
    const decls = emitted(css, form.className, { pseudo: form.pseudo ?? null });

    assert.ok(
      decls.length > 0,
      `${form.className} emitted no CSS — the variant, the token or the arbitrary value was dropped, not applied`
    );

    assert.ok(
      decls.some((d) => d.atRule === form.atRule && d.prop === form.prop && d.value === form.value),
      `${form.className} did not emit ${form.prop}: ${form.value} inside @media ${form.atRule} — got ${JSON.stringify(decls)}`
    );
  }
});

test('026: the column counts the grids fall back to are real, at both widths', async () => {
  // A hardcoded grid-cols-N is what the 020 sweep could not see through: the
  // tracks are minmax(0,1fr), so the boxes fit the frame and only the text
  // inside overflows. These are the overrides that stop that happening, and a
  // silent one would restore the defect exactly.
  const forms = [
    ['mobile:grid-cols-5', '(max-width: 1025px)', 'repeat(5, minmax(0, 1fr))'],
    ['mobile:grid-cols-4', '(max-width: 1025px)', 'repeat(4, minmax(0, 1fr))'],
    ['mobile:grid-cols-2', '(max-width: 1025px)', 'repeat(2, minmax(0, 1fr))'],
    ['phone:grid-cols-3', '(max-width: 768px)', 'repeat(3, minmax(0, 1fr))'],
    ['phone:grid-cols-2', '(max-width: 768px)', 'repeat(2, minmax(0, 1fr))'],
    ['phone:grid-cols-1', '(max-width: 768px)', 'repeat(1, minmax(0, 1fr))'],
  ];
  const css = await emit(forms.map(([c]) => c));

  for (const [className, atRule, value] of forms) {
    assert.deepEqual(
      emitted(css, className),
      [{ atRule, prop: 'grid-template-columns', value }],
      `${className} did not emit its track list`
    );
  }
});

// 132. The paywall's FAQ block closes on mobile and tablets, and the yearly
// discount stops being hidden there. Both rest entirely on `mobile:`-scoped
// utilities: if one of them emitted nothing the block would simply never
// close, or would close on desktop too, and neither shows up as an error.
const PAYWALL_FORMS = [
  {
    // The whole contract of the collapse. `display: none` rather than the
    // questions' max-height transition, because that needs a ceiling and six
    // open answers overrun any number worth writing down.
    className: 'mobile:hidden',
    atRule: '(max-width: 1025px)',
    prop: 'display',
    value: 'none',
  },
  {
    // The toggle is hidden at every width and revealed at one, so the reveal
    // has to outrank the base utility rather than merely exist.
    className: 'mobile:flex',
    atRule: '(max-width: 1025px)',
    prop: 'display',
    value: 'flex',
  },
  {
    className: 'mobile:cursor-pointer',
    atRule: '(max-width: 1025px)',
    prop: 'cursor',
    value: 'pointer',
  },
  {
    // The heading's 40px of air below it belongs to the open state; collapsed,
    // it would sit between the heading and the checkout under it.
    className: 'mobile:mb-0',
    atRule: '(max-width: 1025px)',
    prop: 'margin-bottom',
    value: '0px',
  },
  {
    className: 'mobile:pt-[24px]',
    atRule: '(max-width: 1025px)',
    prop: 'padding-top',
    value: '24px',
  },
  {
    // The discount badge shares a 165px half with its label at 390px; wrapping
    // is what `mobile:hidden` was originally avoiding.
    className: 'whitespace-nowrap',
    atRule: null,
    prop: 'white-space',
    value: 'nowrap',
  },
  {
    // The video frame's width now comes from the card and its height from this
    // — the pair that replaces the iframe's 300x150 UA fallback.
    className: 'aspect-video',
    atRule: null,
    prop: 'aspect-ratio',
    value: '16 / 9',
  },
];

test('132: every class form the paywall video and FAQ changes introduce emits CSS', async () => {
  const css = await emit(PAYWALL_FORMS.map((f) => f.className));

  for (const form of PAYWALL_FORMS) {
    const decls = emitted(css, form.className);

    assert.ok(
      decls.length > 0,
      `${form.className} emitted no CSS — the variant or the arbitrary value was dropped, not applied`
    );

    assert.ok(
      decls.some((d) => d.atRule === form.atRule && d.prop === form.prop && d.value === form.value),
      `${form.className} did not emit ${form.prop}: ${form.value} inside @media ${form.atRule} — got ${JSON.stringify(decls)}`
    );
  }
});

test('132: the FAQ reveal is emitted after the base utility it has to beat', async () => {
  // `hidden mobile:flex` on the toggle and `mobile:hidden` on the list are the
  // same specificity, so which one wins is decided by source order alone. If
  // Tailwind ever emitted the screen variant before the base display utility,
  // the toggle would be invisible on the only viewports it is for — and the
  // page would look exactly as it does today, minus the control.
  const css = await emit(['hidden', 'mobile:flex']);
  const order = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.includes('hidden') && rule.parent?.type !== 'atrule') order.push('base');
    if (rule.selector.includes('flex') && rule.parent?.type === 'atrule') order.push('variant');
  });

  assert.deepEqual(
    order,
    ['base', 'variant'],
    `the mobile: reveal must follow the base hidden, got ${JSON.stringify(order)}`
  );
});

// 138. The UI-polish batch. Same contract as the arrays above, for the forms it
// introduces: each one is a variant or an arbitrary value that emits nothing at
// all when it is wrong, and every one of them carries a layout decision that
// would simply not happen rather than fail.
const UI_POLISH_FORMS = [
  {
    // Support's two-track grid. An arbitrary value carrying both commas and
    // underscores is the form most likely to be dropped silently — underscores
    // become spaces, commas have to survive un-escaped, and if Tailwind cannot
    // parse it the page simply renders one column with no warning anywhere.
    className: 'grid-cols-[minmax(0,900px)_minmax(280px,340px)]',
    atRule: null,
    prop: 'grid-template-columns',
    value: 'minmax(0,900px) minmax(280px,340px)',
  },
  {
    // The channels row and the customer control swap places only once they
    // stack. A direction utility behind a raw screen variant is exactly the
    // pairing that emits nothing if the screen was renamed.
    className: 'mobile:flex-col-reverse',
    atRule: '(max-width: 1025px)',
    prop: 'flex-direction',
    value: 'column-reverse',
  },
  {
    // Delete Post takes a full row of its own, the way tag and repeat do.
    className: 'mobile:basis-full',
    atRule: '(max-width: 1025px)',
    prop: 'flex-basis',
    value: '100%',
  },
];

test('138: every class form the UI-polish batch introduces emits CSS', async () => {
  const css = await emit(UI_POLISH_FORMS.map((f) => f.className));

  for (const form of UI_POLISH_FORMS) {
    const decls = emitted(css, form.className);

    assert.ok(
      decls.length > 0,
      `${form.className} emitted no CSS — the variant or the arbitrary value was dropped, not applied`
    );

    assert.ok(
      decls.some((d) => d.atRule === form.atRule && d.prop === form.prop && d.value === form.value),
      `${form.className} did not emit ${form.prop}: ${form.value} inside @media ${form.atRule} — got ${JSON.stringify(decls)}`
    );
  }
});

test('138: the wrapper variant reaches the control inside it', async () => {
  // `[&>*]` emits a child combinator on the selector rather than a media-query
  // wrapper alone, so UI_POLISH_FORMS' "matched by class" shape cannot see it.
  // The claim is the same: the variant emitted something, and what it emitted
  // centres the child. The date picker is reached through its wrapper, so its
  // alignment is an arbitrary variant carrying an important flag — three
  // things that each drop silently, in one class.
  const css = await emit(['mobile:[&>*]:!justify-center']);

  assert.match(css, /@media \(max-width: 1025px\)/);
  assert.match(css, /justify-content: center !important/);
});
