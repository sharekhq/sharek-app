import { filterEnabledProviders } from './enabled.providers';

const providers = ['x', 'linkedin', 'mastodon'].map((identifier) => ({
  identifier,
}));

const ids = (list: Array<{ identifier: string }>) =>
  list.map((p) => p.identifier);

describe('filterEnabledProviders', () => {
  it('returns every provider when the allow-list is unset', () => {
    expect(ids(filterEnabledProviders(providers, undefined))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
  });

  it('treats an empty or whitespace-only allow-list as unset', () => {
    expect(ids(filterEnabledProviders(providers, ''))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
    expect(ids(filterEnabledProviders(providers, ' ,  ,'))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
  });

  it('keeps only the identifiers named in the allow-list, in catalog order', () => {
    expect(ids(filterEnabledProviders(providers, 'linkedin,x'))).toEqual([
      'x',
      'linkedin',
    ]);
  });

  it('normalizes whitespace and case and ignores unknown identifiers', () => {
    expect(
      ids(filterEnabledProviders(providers, ' X , Linkedin , nope '))
    ).toEqual(['x', 'linkedin']);
  });

  it('reads SHAREK_ENABLED_PROVIDERS from the environment by default', () => {
    const prev = process.env.SHAREK_ENABLED_PROVIDERS;
    process.env.SHAREK_ENABLED_PROVIDERS = 'mastodon';
    try {
      expect(ids(filterEnabledProviders(providers))).toEqual(['mastodon']);
    } finally {
      if (prev === undefined) {
        delete process.env.SHAREK_ENABLED_PROVIDERS;
      } else {
        process.env.SHAREK_ENABLED_PROVIDERS = prev;
      }
    }
  });
});
