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
