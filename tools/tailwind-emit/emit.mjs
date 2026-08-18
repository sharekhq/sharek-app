// Runs the installed Tailwind over a fixture and hands back the CSS it emitted.
//
// This is tooling, not app code: nothing here ships in the image. It exists so
// a test can assert what Tailwind *produced* rather than what the config says
// it should produce — the two come apart silently, because an unknown variant
// or an unparseable arbitrary value emits nothing at all and never warns.
//
// It deliberately uses the project's own apps/frontend/tailwind.config.cjs
// rather than a copy of the parts it needs. A fixture that restates `mobile`
// and `coarse` would keep passing after someone renamed either one, which is
// the failure it is supposed to catch.
//
// Only `content` is replaced, with the fixture's own class list, so a run
// costs milliseconds instead of scanning apps/frontend and libraries.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(HERE, '..', '..', 'apps', 'frontend', 'tailwind.config.cjs');

/**
 * @param {string[]} classNames class names to compile, as they are written in JSX
 * @returns {Promise<string>} the emitted utility CSS
 */
export async function emit(classNames) {
  const tailwindcss = require('tailwindcss');
  const config = require(CONFIG);

  // `utilities` alone: base and components add hundreds of rules that no
  // assertion here reads, and their absence makes a failure legible.
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: classNames.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });

  return result.css;
}
