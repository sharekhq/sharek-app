import {
  ATTRIBUTION_KEYS,
  pickAttribution,
  readAttribution,
} from './attribution';

describe('attribution set', () => {
  // The set is a contract with sharek.app, which appends these parameters to
  // its links; widening it is a deliberate change to FR-009 and this module.
  it('names the eleven keys', () => {
    expect(ATTRIBUTION_KEYS).toEqual([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'ref',
      'gclid',
      'fbclid',
      'ttclid',
      'referrer',
      'landing_url',
    ]);
  });
});

describe('pickAttribution', () => {
  it('keeps the named keys and ignores any other', () => {
    expect(
      pickAttribution({ utm_source: 'twitter', ref: 'home-hero', junk: 'x' })
    ).toEqual({ utm_source: 'twitter', ref: 'home-hero' });
  });

  it('drops blank and non-string values', () => {
    expect(pickAttribution({ utm_source: '  ', gclid: 42 })).toEqual({});
  });

  it('drops a value over 256 characters instead of truncating it', () => {
    expect(pickAttribution({ utm_campaign: 'a'.repeat(257) })).toEqual({});
  });

  it('keeps a value of exactly 256 characters', () => {
    expect(pickAttribution({ utm_campaign: 'a'.repeat(256) })).toEqual({
      utm_campaign: 'a'.repeat(256),
    });
  });

  it('counts characters, not bytes, so 256 Arabic letters fit', () => {
    expect(pickAttribution({ utm_term: 'ج'.repeat(256) })).toEqual({
      utm_term: 'ج'.repeat(256),
    });
  });

  it('stores a kept value trimmed', () => {
    expect(pickAttribution({ utm_source: '  twitter  ' })).toEqual({
      utm_source: 'twitter',
    });
  });

  // The registration body reaches the service as a class instance, not an
  // object literal, once the validation pipe has transformed it.
  it('reads the named keys from a class instance', () => {
    class Body {
      email = 'a@b.c';
      utm_source = 'twitter';
    }
    expect(pickAttribution(new Body())).toEqual({ utm_source: 'twitter' });
  });

  it.each([null, undefined, 'str', 42, []])(
    'returns an empty set for %p without throwing',
    (input) => {
      expect(pickAttribution(input)).toEqual({});
    }
  );
});

describe('readAttribution', () => {
  it('keeps the named parameters and the landing origin and path, and nothing else', () => {
    expect(
      readAttribution(
        new URLSearchParams('?ref=a&utm_source=b&junk=c'),
        '',
        'https://dash.sharek.app/auth?ref=a'
      )
    ).toEqual({
      ref: 'a',
      utm_source: 'b',
      landing_url: 'https://dash.sharek.app/auth',
    });
  });

  it('reads every campaign parameter, CTA id and click id', () => {
    expect(
      readAttribution(
        new URLSearchParams(
          'utm_source=s&utm_medium=m&utm_campaign=c&utm_term=t&utm_content=n&ref=r&gclid=g&fbclid=f&ttclid=tt'
        ),
        '',
        'https://dash.sharek.app/auth'
      )
    ).toEqual({
      utm_source: 's',
      utm_medium: 'm',
      utm_campaign: 'c',
      utm_term: 't',
      utm_content: 'n',
      ref: 'r',
      gclid: 'g',
      fbclid: 'f',
      ttclid: 'tt',
      landing_url: 'https://dash.sharek.app/auth',
    });
  });

  it('records the referrer the browser delivered', () => {
    expect(
      readAttribution(
        new URLSearchParams(''),
        'https://sharek.app/',
        'https://dash.sharek.app/auth'
      )
    ).toEqual({
      referrer: 'https://sharek.app/',
      landing_url: 'https://dash.sharek.app/auth',
    });
  });

  it('takes the referrer and the landing address from the browser, never from the query', () => {
    expect(
      readAttribution(
        new URLSearchParams('referrer=x&landing_url=y'),
        '',
        'https://dash.sharek.app/auth'
      )
    ).toEqual({ landing_url: 'https://dash.sharek.app/auth' });
  });

  // A paid-click arrival runs past 256 characters as a full URL; its
  // parameters are captured key by key, so the address keeps origin and path.
  it('reduces the landing address to origin and path before the length rule applies', () => {
    expect(
      readAttribution(
        new URLSearchParams(''),
        '',
        `https://dash.sharek.app/auth?gclid=${'g'.repeat(300)}#top`
      )
    ).toEqual({ landing_url: 'https://dash.sharek.app/auth' });
  });

  it('drops a landing address that does not parse', () => {
    expect(readAttribution(new URLSearchParams(''), '', 'not a url')).toEqual(
      {}
    );
  });

  it('applies the pickAttribution rule to parameter values', () => {
    expect(
      readAttribution(
        new URLSearchParams(
          `utm_source=%20%20&utm_campaign=${'a'.repeat(257)}&ref=%20x%20`
        ),
        '',
        'https://dash.sharek.app/auth'
      )
    ).toEqual({ ref: 'x', landing_url: 'https://dash.sharek.app/auth' });
  });
});
