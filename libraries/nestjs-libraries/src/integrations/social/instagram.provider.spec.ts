// The real timer waits 5 s between retries. A retry here means the mapping
// was lost, so the test should say so at once instead of timing out.
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn().mockResolvedValue(undefined),
}));

import { InstagramProvider } from './instagram.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// Meta's refusal once the account is over the Content Publishing API's Trial
// Reel limit (code 9, subcode 2207078). The message is a stand-in: it must not
// contain any other string handleErrors matches ('Page request limit
// reached', '190,', '36001', ...), so losing the mapping lands on
// 'Unknown Error' instead of another message.
const trialReelLimit = JSON.stringify({
  error: {
    message: 'Trial reel limit reached for this account',
    type: 'OAuthException',
    code: 9,
    error_subcode: 2207078,
    fbtrace_id: 'trace-1',
  },
});

const READABLE =
  'Instagram Trial Reel publish limit reached for this account, please try again later or publish the post as a regular Reel';

describe('InstagramProvider, a Trial Reel over the account limit', () => {
  // The calendar shows curated bad_body messages (PostsRepository.curatedError)
  // and "Unknown Error" otherwise.
  it('maps the refusal to a message the calendar can show', () => {
    expect(new InstagramProvider().handleErrors(trialReelLimit, 400)).toEqual({
      type: 'bad-body',
      value: READABLE,
    });
  });

  it.each([400, 500])(
    'fails the publish once, without a retry, on HTTP %s',
    async (status) => {
      const fetchMock = jest.fn().mockResolvedValue({
        status,
        ok: false,
        text: async () => trialReelLimit,
        json: async () => JSON.parse(trialReelLimit),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const failure = await new InstagramProvider()
        .fetch(
          'https://graph.facebook.com/v25.0/17841400000000000/media_publish',
          { method: 'POST' }
        )
        .catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(BadBody);
      expect((failure as BadBody).nonRetryable).toBe(true);
      expect((failure as BadBody).message).toBe(READABLE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
});
