// 050 — Samy and images. The classes the chat's box and messages rest on. A
// variant or arbitrary value that Tailwind can't use emits nothing and the page
// just doesn't change, so this file asserts what Tailwind emitted for them, with
// the project's own config (see emit.mjs).
//
// `max-[400px]:` is the trap here: `screens` holds `raw` objects, so Tailwind
// drops every `min-*` and `max-*` variant with only a build warning. The 400px
// and 340px steps are written as arbitrary media variants instead.
//
// Run with: node --test 'tools/tailwind-emit/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';

import postcss from 'postcss';

import { emit } from './emit.mjs';

// What Tailwind emitted for one class: its declarations, and the media query it
// sits under, if any.
const rules = (css, className) => {
  const selector = `.${className.replace(/[^\w-]/g, (c) => `\\${c}`)}`;
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selector.includes(selector)) {
      const parent = rule.parent;
      found.push({
        atRule: parent.type === 'atrule' ? parent.params : undefined,
        decls: rule.nodes
          .filter((node) => node.type === 'decl')
          .map((d) => ({ prop: d.prop, value: d.value, important: !!d.important })),
      });
    }
  });
  return found;
};

const STEP_400 = '(max-width:400px)';
const STEP_340 = '(max-width:340px)';
const PHONE = '(max-width: 768px)';
const COARSE = '(pointer: coarse)';

test('the 400px and 340px steps emit, under their own queries', async () => {
  const css = await emit([
    '[@media(max-width:400px)]:px-[8px]',
    '[@media(max-width:400px)]:gap-[4px]',
    '[@media(max-width:400px)]:text-[12px]',
    '[@media(max-width:340px)]:!hidden',
  ]);

  for (const className of [
    '[@media(max-width:400px)]:px-[8px]',
    '[@media(max-width:400px)]:gap-[4px]',
    '[@media(max-width:400px)]:text-[12px]',
  ]) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    assert.equal(found[0].atRule, STEP_400);
  }
  // Important, because CopilotKit's `.copilotKitChat svg` outranks a plain class,
  // and the walk's measure was Send over AI Image at 320px.
  const hidden = rules(css, '[@media(max-width:340px)]:!hidden');
  assert.ok(hidden.length > 0, 'the 340px step emitted no CSS');
  assert.equal(hidden[0].atRule, STEP_340);
  assert.deepEqual(hidden[0].decls, [
    { prop: 'display', value: 'none', important: true },
  ]);
});

test('the phone sizes of tiles and buttons emit under the phone screen', async () => {
  const classes = [
    'phone:w-[76px]',
    'phone:h-[76px]',
    'phone:h-[44px]',
    'phone:gap-[8px]',
    'phone:px-[12px]',
    'phone:text-[13px]',
    'phone:w-[20px]',
    'phone:h-[20px]',
  ];
  const css = await emit(classes);

  for (const className of classes) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    assert.equal(found[0].atRule, PHONE);
  }
});

test('the touch floors emit, and only under a coarse pointer', async () => {
  const classes = [
    'coarse:h-[44px]',
    'coarse:w-[44px]',
    'coarse:-top-[5px]',
    'coarse:-end-[5px]',
  ];
  const css = await emit(classes);

  for (const className of classes) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    assert.equal(found[0].atRule, COARSE);
  }
});

test('the colour and shape forms the box uses emit', async () => {
  const classes = [
    'bg-surface2',
    'bg-aiSoft',
    'bg-brandSoft2',
    'text-brandText',
    'text-aiAccent',
    'hover:border-aiAccent',
    'bg-black/[0.62]',
    'group-hover:bg-black/[0.82]',
    'opacity-[0.45]',
    'backdrop-blur-[3px]',
    '[scrollbar-width:none]',
    '[&::-webkit-scrollbar]:hidden',
  ];
  const css = await emit(classes);

  for (const className of classes) {
    assert.ok(
      rules(css, className).length > 0,
      `${className} emitted no CSS`
    );
  }
});

// Read by value: its selector escapes the commas in a form rules() can't match.
test("the drop overlay's translucent fill emits", async () => {
  const css = await emit([
    'bg-[color-mix(in_srgb,var(--surface)_90%,transparent)]',
  ]);

  assert.match(
    css,
    /background-color: color-mix\(in srgb, ?var\(--surface\) 90%, ?transparent\)/
  );
});

test("a sent image's sizes emit, important, because the vendor's rules outrank utilities", async () => {
  const classes = [
    '!w-[120px]',
    '!h-[120px]',
    'phone:!w-[96px]',
    'phone:!h-[96px]',
    '!pt-[10px]',
    '!px-[10px]',
    '!pb-[8px]',
  ];
  const css = await emit(classes);

  for (const className of classes) {
    const found = rules(css, className);
    assert.ok(found.length > 0, `${className} emitted no CSS`);
    assert.ok(
      found[0].decls.every((decl) => decl.important),
      `${className} is not important`
    );
  }
  assert.equal(rules(css, 'phone:!w-[96px]')[0].atRule, PHONE);
});

// A row sees its cards as its own children, so a card alone can grow. Each of these
// has to outrank its phone size, or a lone image would stay 150px on a phone.
test('a card alone reaches 420px, and only alone', async () => {
  const css = await emit([
    '[container-type:inline-size]',
    'group-only:max-w-[min(420px,100cqw)]',
    'only:w-[min(420px,calc(480px*var(--card-ratio)),100cqw)]',
    'max-w-[190px]',
    'phone:max-w-[150px]',
    'w-[190px]',
    'phone:w-[150px]',
  ]);

  // Read whole, because Tailwind writes the comma in these names as `\2c `.
  assert.match(css, /container-type: inline-size/);
  assert.match(
    css,
    /\.group:only-child \.group-only\\:max-w-[^{]*\{\s*max-width: min\(420px, ?100cqw\)/
  );
  assert.match(
    css,
    /\.only\\:w-[^{]*:only-child \{\s*width: min\(420px, ?calc\(480px \* var\(--card-ratio\)\), ?100cqw\)/
  );
  assert.equal(rules(css, 'phone:max-w-[150px]')[0].atRule, PHONE);
  assert.equal(rules(css, 'phone:w-[150px]')[0].atRule, PHONE);
});

test("a card's waiting and framing forms emit", async () => {
  const css = await emit([
    'empty:hidden',
    'motion-safe:animate-pulse',
    'aspect-[var(--card-ratio)]',
    'max-h-[480px]',
    'rounded-[16px]',
    'after:border-line',
    "after:content-['']",
    'after:inset-0',
  ]);

  assert.match(css, /\.empty\\:hidden:empty/);
  const pulse = rules(css, 'motion-safe:animate-pulse');
  assert.ok(pulse.length > 0, 'the pulse emitted no CSS');
  assert.equal(pulse[0].atRule, '(prefers-reduced-motion: no-preference)');
  assert.deepEqual(rules(css, 'aspect-[var(--card-ratio)]')[0].decls[0], {
    prop: 'aspect-ratio',
    value: 'var(--card-ratio)',
    important: false,
  });
  assert.match(css, /\.after\\:border-line::after/);
  assert.match(css, /\.after\\:content-\\\[\\'\\'\\\]::after/);
});
