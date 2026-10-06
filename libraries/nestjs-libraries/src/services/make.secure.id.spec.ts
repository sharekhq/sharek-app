import { makeSecureId } from './make.secure.id';

// makeSecureId mints credentials: API keys, OAuth client secrets and codes,
// login state and PKCE verifiers. makeId drew them from Math.random, which an
// attacker can predict (CVE-2026-94456).
describe('makeSecureId', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the requested number of characters from the makeId alphabet', () => {
    expect(makeSecureId(48)).toMatch(/^[A-Za-z0-9]{48}$/);
  });

  it('does not draw from Math.random', () => {
    // Pinned, Math.random would make every id the same.
    jest.spyOn(Math, 'random').mockReturnValue(0);

    expect(makeSecureId(32)).not.toBe(makeSecureId(32));
  });
});
