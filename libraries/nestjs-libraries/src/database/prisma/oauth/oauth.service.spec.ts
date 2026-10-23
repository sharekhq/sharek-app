// HubSpot arrives switched off: with its settings unset, or passed through as
// empty strings, there is no install link, the install callback is not found
// and no client gets a refresh grant.
// The repository opens a database client at import; the switched-off paths never reach it, and the
// install path only talks to HubSpot (fetch).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.repository',
  () => ({ OAuthRepository: class {} })
);

import { HttpException } from '@nestjs/common';
import {
  OAuthService,
  hubspotInstallUrl,
} from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';

const SETTINGS = [
  'HUBSPOT_OAUTH_CLIENT_ID',
  'HUBSPOT_APP_CLIENT_ID',
  'HUBSPOT_APP_CLIENT_SECRET',
] as const;

const makeService = (getAppByClientId: jest.Mock = jest.fn()) =>
  new OAuthService({ getAppByClientId } as unknown as ConstructorParameters<
    typeof OAuthService
  >[0]);

afterEach(() => {
  for (const name of SETTINGS) delete process.env[name];
});

describe.each([
  ['unset', undefined],
  ['blank', ''],
])('HubSpot with its settings %s', (_name, value) => {
  beforeEach(() => {
    if (value !== undefined) {
      for (const name of SETTINGS) process.env[name] = value;
    }
  });

  // The Integrations list leaves HubSpot out when there is no install link.
  it('offers no install link', () => {
    expect(hubspotInstallUrl()).toBeUndefined();
  });

  it('answers the install callback "not found" and calls nobody', async () => {
    // Never the network, even when the guard is gone.
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('offline'));

    const failure = await makeService()
      .completeHubspotInstall('code-1')
      .catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  // Every client keeps the answer it had before HubSpot: no refresh grant.
  it.each(['a-registered-client', ''])(
    'refuses the refresh_token grant for client %p',
    async (clientId) => {
      const getAppByClientId = jest.fn();

      const failure = await makeService(getAppByClientId)
        .refreshAccessToken(clientId, 'pos_token')
        .catch((err: unknown) => err);

      expect((failure as HttpException).getResponse()).toEqual({
        error: 'unsupported_grant_type',
      });
      expect(getAppByClientId).not.toHaveBeenCalled();
    }
  );
});
