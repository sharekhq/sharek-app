import { DiscordProvider } from './discord.provider';

describe('DiscordProvider.handleErrors, a refused bot token', () => {
  // What Discord answers every call made with a revoked or stale bot token.
  const unauthorized = JSON.stringify({
    message: '401: Unauthorized',
    code: 0,
  });

  // The calendar shows curated bad_body messages (PostsRepository.curatedError),
  // so the customer reads this text, and the token is the app's, not theirs.
  it('fails the post with a message that names Sharek', () => {
    const refusal = new DiscordProvider().handleErrors(unauthorized);

    expect(refusal?.type).toBe('bad-body');
    expect(refusal?.value).toContain('Sharek');
    expect(refusal?.value).not.toMatch(/postiz/i);
  });
});
