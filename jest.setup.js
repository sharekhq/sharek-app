// Installs a DOM for the component specs.
//
// Not jsdom: jest-environment-jsdom pulls in the optional `canvas` package, whose native
// binding is not built in this install, so requiring it throws before any test runs. happy-dom
// has no native dependency. Its package `main` is ESM, which this CommonJS ts-jest setup cannot
// load, so the CJS build is required through its published subpath instead.
const { Window } = require('happy-dom/cjs/index.cjs');

const win = new Window({ url: 'http://localhost' });

// React reads these off globalThis rather than through a window handle.
const GLOBALS = [
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'DocumentFragment',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];

global.window = win;
for (const key of GLOBALS) {
  if (win[key] !== undefined) global[key] = win[key];
}

// Opts React 19 into act(), so state updates flush synchronously inside tests.
global.IS_REACT_ACT_ENVIRONMENT = true;
