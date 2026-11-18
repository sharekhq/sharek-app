// The manager imports every social provider, and nostr.provider pulls in
// nostr-tools, which ships ESM that Jest's CommonJS transform cannot load. The
// package is only used inside provider methods, so stubbing it keeps the real
// providers in the catalog. jest.mock is hoisted above the imports below.
jest.mock('nostr-tools', () => ({
  getPublicKey: () => '',
  finalizeEvent: () => ({}),
  Relay: class {},
  SimplePool: class {},
}));

import * as fs from 'fs';
import * as path from 'path';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { CHATGPT_TOOLSET } from './chatgpt.toolset';

/**
 * The ChatGPT listing (chatgpt-plugin/plugin.json) is reviewed by OpenAI: the
 * tools its review cases name must be the ones the connection serves, and the
 * listing must not promise what the connection no longer does.
 */

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const plugin = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'chatgpt-plugin/plugin.json'), 'utf8')
);
const openai = plugin.extensions['com.openai'];

const chatgptToolNames = new Set([
  ...Object.values(CHATGPT_TOOLSET).map((row) => row.name),
  ...Object.values(new IntegrationManager().getAllLookups())
    .flat()
    .map((lookup) => lookup.name),
]);

const reviewCases = [
  ...openai.review.test_cases.positive,
  ...openai.review.test_cases.negative,
].filter((testCase) => testCase.tools_triggered);

describe('ChatGPT plugin listing', () => {
  it('names only ChatGPT tools in tools_triggered', () => {
    const named = reviewCases.flatMap((testCase) =>
      testCase.tools_triggered.split(',').map((name: string) => name.trim())
    );

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name: string) => !chatgptToolNames.has(name))).toEqual(
      []
    );
  });

  it('promises images and no videos', () => {
    const { longDescription } = openai.interface;

    expect(longDescription).toMatch(/images/i);
    expect(longDescription).not.toMatch(/videos?/i);
  });

  it('raises the version above 1.0.0', () => {
    const [major, minor, patch] = plugin.version.split('.').map(Number);

    expect(
      [major, minor, patch] > [1, 0, 0] || major > 1 || minor > 0 || patch > 0
    ).toBe(true);
  });
});
