// The manager imports every social provider, and nostr.provider pulls in
// nostr-tools, which ships ESM that Jest's CommonJS transform cannot load. The
// package is only used inside provider methods, so stubbing it keeps the real
// NostrProvider — and its identifier — in the catalog these tests assert on.
// jest.mock is hoisted above the imports below.
jest.mock('nostr-tools', () => ({
  getPublicKey: () => '',
  finalizeEvent: () => ({}),
  Relay: class {},
  SimplePool: class {},
}));

import {
  IntegrationManager,
  socialIntegrationList,
} from './integration.manager';

// The two catalog filters are independent and both must apply: Sharek curates
// the add-channel screen with SHAREK_LISTED_PROVIDERS (an allow-list), upstream
// hides individual providers with HIDDEN_PROVIDERS (a deny-list).
const withEnv = async (
  env: Record<string, string | undefined>,
  run: () => Promise<string[]>
) => {
  const previous = Object.keys(env).map(
    (key) => [key, process.env[key]] as const
  );

  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return await run();
  } finally {
    previous.forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

const listedIdentifiers = async () =>
  (await new IntegrationManager().getAllIntegrations()).social.map(
    (p) => p.identifier
  );

describe('IntegrationManager catalog filters', () => {
  it('applies the allow-list and the hide-list together', async () => {
    const identifiers = await withEnv(
      { SHAREK_LISTED_PROVIDERS: 'tiktok,x', HIDDEN_PROVIDERS: 'x' },
      listedIdentifiers
    );

    expect(identifiers).toEqual(['tiktok']);
  });

  it('lists the whole catalog when neither variable is set', async () => {
    const identifiers = await withEnv(
      { SHAREK_LISTED_PROVIDERS: undefined, HIDDEN_PROVIDERS: undefined },
      listedIdentifiers
    );

    expect(identifiers).toEqual(socialIntegrationList.map((p) => p.identifier));
  });

  it('keeps only the allow-listed providers, in catalog order', async () => {
    const identifiers = await withEnv(
      { SHAREK_LISTED_PROVIDERS: 'tiktok,x', HIDDEN_PROVIDERS: undefined },
      listedIdentifiers
    );

    // The allow-list names them the other way round: the catalog decides the
    // order the add-channel screen shows, not the variable.
    expect(identifiers).toEqual(['x', 'tiktok']);
  });

  it('keeps upstream hide-list semantics when the allow-list is unset', async () => {
    const identifiers = await withEnv(
      { SHAREK_LISTED_PROVIDERS: undefined, HIDDEN_PROVIDERS: 'x' },
      listedIdentifiers
    );

    expect(identifiers).toEqual(
      socialIntegrationList
        .map((p) => p.identifier)
        .filter((identifier) => identifier !== 'x')
    );
  });
});

// POST /integrations/function runs a provider method by name with the
// channel's stored token as its first argument (CVE-2026-115931), so only @Tool
// methods and the ones marked @DashboardFunction may run that way.
describe('IntegrationManager.isDashboardCallable', () => {
  const manager = new IntegrationManager();
  const callable = (identifier: string, method: string) =>
    manager.isDashboardCallable(
      manager.getSocialIntegration(identifier),
      method
    );

  it.each([
    // reads a local file when its first argument is not a URL
    ['lemmy', 'readOrFetch'],
    ['lemmy', 'mediaSize'],
    ['lemmy', 'constructor'],
    ['lemmy', 'doesNotExist'],
    // a field, not a method
    ['lemmy', 'identifier'],
    // a plain method, neither a tool nor marked
    ['x', 'post'],
  ])('refuses %s %s', (identifier, method) => {
    expect(callable(identifier, method)).toBe(false);
  });

  it('refuses the media readers on every provider', () => {
    const offenders = socialIntegrationList.flatMap((provider) =>
      ['readOrFetch', 'mediaSize', 'mediaChunk', 'mediaStream']
        .filter((method) => manager.isDashboardCallable(provider, method))
        .map((method) => `${provider.identifier} ${method}`)
    );

    expect(offenders).toEqual([]);
  });

  // Every function the frontend calls through the route, re-derived on
  // 2026-10-26 from the useCustomProviderFunction callers, the continue
  // providers' endpoints, the LinkedIn company lookup and the TikTok panel. A
  // sync that drops a mark fails here before the picker answers "Function not
  // found" in the composer.
  it.each([
    ['devto', 'tags'],
    ['devto', 'organizations'],
    ['discord', 'channels'],
    ['dribbble', 'teams'],
    ['hashnode', 'publications'],
    ['hashnode', 'tags'],
    ['instagram', 'audioSearch'],
    ['instagram', 'pages'],
    ['lemmy', 'subreddits'],
    ['listmonk', 'list'],
    ['listmonk', 'templates'],
    ['medium', 'publications'],
    ['mewe', 'groups'],
    // a @Tool
    ['pinterest', 'boards'],
    ['reddit', 'restrictions'],
    ['reddit', 'subreddits'],
    ['skool', 'groups'],
    ['skool', 'label'],
    ['slack', 'channels'],
    ['tiktok-business', 'locationSearch'],
    ['tiktok-business', 'musicSearch'],
    ['wrapcast', 'subreddits'],
    ['whop', 'companies'],
    ['whop', 'experiences'],
    ['wordpress', 'postTypes'],
    ['wordpress', 'categoriesList'],
    ['wordpress', 'tagsList'],
    // marked
    ['facebook', 'pages'],
    ['gmb', 'pages'],
    ['tumblr', 'pages'],
    ['youtube', 'pages'],
    ['linkedin-page', 'companies'],
    ['linkedin', 'company'],
    // LinkedinProvider's mark, inherited
    ['linkedin-page', 'company'],
    // the fork's TikTok panel
    ['tiktok', 'creatorInfo'],
  ])('lets the dashboard run %s %s', (identifier, method) => {
    expect(callable(identifier, method)).toBe(true);
  });

  // /integrations/mentions always runs mention, which SocialAbstract marks.
  it('lets the dashboard run mention on every provider', () => {
    const refused = socialIntegrationList
      .filter((provider) => !manager.isDashboardCallable(provider, 'mention'))
      .map((provider) => provider.identifier);

    expect(refused).toEqual([]);
  });
});
