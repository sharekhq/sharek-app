// CJS stand-in for `@sindresorhus/slugify`, which ships ESM only, for the same
// reason as tokenx.stub.ts: @mastra/core's CJS build requires it, and under
// --experimental-vm-modules jest will not require an ES module. Mastra slugs
// agent and skill names into ids with it; no assertion in the integration specs
// depends on the exact slug. As with p-map.stub.ts, the module is the function.
const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export = slugify;
