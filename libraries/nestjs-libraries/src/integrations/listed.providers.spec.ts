import { Logger } from '@nestjs/common';
import { filterListedProviders } from './listed.providers';

const providers = ['x', 'linkedin', 'mastodon'].map((identifier) => ({
  identifier,
}));

const ids = (list: Array<{ identifier: string }>) =>
  list.map((p) => p.identifier);

describe('filterListedProviders', () => {
  it('returns every provider when the allow-list is unset', () => {
    expect(ids(filterListedProviders(providers, undefined))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
  });

  it('treats an empty or whitespace-only allow-list as unset', () => {
    expect(ids(filterListedProviders(providers, ''))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
    expect(ids(filterListedProviders(providers, ' ,  ,'))).toEqual([
      'x',
      'linkedin',
      'mastodon',
    ]);
  });

  it('keeps only the identifiers named in the allow-list, in catalog order', () => {
    expect(ids(filterListedProviders(providers, 'linkedin,x'))).toEqual([
      'x',
      'linkedin',
    ]);
  });

  it('normalizes whitespace and case and ignores unknown identifiers', () => {
    expect(
      ids(filterListedProviders(providers, ' X , Linkedin , nope '))
    ).toEqual(['x', 'linkedin']);
  });

  it('matches identifiers case-insensitively on the provider side too', () => {
    const mixedCase = [{ identifier: 'Bluesky' }, { identifier: 'x' }];
    expect(ids(filterListedProviders(mixedCase, 'bluesky'))).toEqual([
      'Bluesky',
    ]);
  });

  it('reads SHAREK_LISTED_PROVIDERS from the environment by default', () => {
    const prev = process.env.SHAREK_LISTED_PROVIDERS;
    process.env.SHAREK_LISTED_PROVIDERS = 'mastodon';
    try {
      expect(ids(filterListedProviders(providers))).toEqual(['mastodon']);
    } finally {
      if (prev === undefined) {
        delete process.env.SHAREK_LISTED_PROVIDERS;
      } else {
        process.env.SHAREK_LISTED_PROVIDERS = prev;
      }
    }
  });

  describe('unknown-entry warnings', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('warns for each allow-list entry that matches no provider identifier', () => {
      filterListedProviders(providers, 'x,twitter,facebok');
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"twitter"'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"facebok"'));
    });

    it('does not warn when every entry is a known identifier', () => {
      filterListedProviders(providers, 'linkedin, mastodon');
      expect(warn).not.toHaveBeenCalled();
    });

    it('warns only once per distinct allow-list value', () => {
      filterListedProviders(providers, 'x,tw1tter');
      filterListedProviders(providers, 'x,tw1tter');
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
