// Guards which key the website lookup's flag follows, the way
// paywall.direction.spec.ts guards the paywall's borders: by reading the
// layouts rather than rendering them, because a layout is a server component
// that pulls in the fonts, the cookies and every provider, and none of that is
// what the claim is about.
//
// The bug this exists for: the flag is set three times, once in each layout,
// and nothing ties the three together. It is a plain boolean read from the
// environment, so a layout left on Tavily's key type-checks, builds and
// renders. Its screens would then offer "Fill from my website" on a server
// whose lookup, which asks Firecrawl, has no key, or hide it on one that has.
import * as fs from 'fs';
import * as path from 'path';

const APP = path.join(__dirname, '../../../../apps/frontend/src/app');

const LAYOUTS = ['(app)', '(provider)', '(extension)'];

const sourceOf = (group: string): string =>
  fs.readFileSync(path.join(APP, group, 'layout.tsx'), 'utf8');

// What each layout hands the flag, without the braces. A layout that doesn't
// set the flag gives an empty list, which equals nothing below, so a scan
// matching nothing can't pass.
const flagsIn = (source: string): string[] =>
  Array.from(source.matchAll(/websiteLookup=\{([^}]*)\}/g), (match) =>
    match[1].trim()
  );

describe("the layouts' guard", () => {
  it.each(LAYOUTS)(
    'the flag follows the Firecrawl key in %s/layout.tsx',
    (group) => {
      const source = sourceOf(group);

      expect(flagsIn(source)).toEqual(['!!process.env.FIRECRAWL_API_KEY']);
      // No layout names Tavily's key for anything else, so it isn't named at
      // all: not beside Firecrawl's in the flag, and not in a second flag.
      expect(source).not.toContain('TAVILY_API_KEY');
    }
  );
});
