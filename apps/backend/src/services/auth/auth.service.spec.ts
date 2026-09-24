// AuthService signs its tokens with this secret when it makes them.
process.env.JWT_SECRET = 'test';

// The sign-up events go through the real TrackService, and posthog-node, its
// transport, is the double: each case chooses what the client does. The
// Facebook SDK the same module loads and the services AuthService is built
// with drag in Prisma or the network; none of that code runs here, so the
// modules are swapped for shells (same pattern as stripe.service.spec).
const mockCapture = jest.fn();
const mockNewsletterRegister = jest.fn();
jest.mock('posthog-node', () => ({
  PostHog: class {
    capture = mockCapture;
    on = jest.fn();
  },
}));
jest.mock('facebook-nodejs-business-sdk', () => ({
  FacebookAdsApi: { init: jest.fn() },
  ServerEvent: class {},
  EventRequest: class {},
  UserData: class {},
  CustomData: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({ NotificationService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@gitroom/backend/services/auth/providers/providers.manager', () => ({
  AuthProviderManager: class {},
}));
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({
  NewsletterService: { register: mockNewsletterRegister },
}));

import { Provider } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthService as AuthChecker } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { AuthProviderManager } from '@gitroom/backend/services/auth/providers/providers.manager';

const IP = '203.0.113.7';
const AGENT = 'Mozilla/5.0';
const USER = { id: 'user-1', email: 'a@b.c', name: 'A' };
const PASSWORD = 'secret-password';

const makeService = () => {
  const order: string[] = [];
  mockCapture.mockImplementation(() => {
    order.push('capture');
  });
  // A write is recorded when it resolves, a tick after the call, as a real
  // query's is: a capture that does not wait for it lands first.
  const users = {
    getUserByEmail: jest.fn().mockResolvedValue(null),
    getUserByProvider: jest.fn().mockResolvedValue(null),
    activateUser: jest.fn(async () => {
      await Promise.resolve();
      order.push('db');
    }),
  };
  const organizations = {
    createOrgAndUser: jest.fn(async () => {
      await Promise.resolve();
      order.push('db');
      return { id: 'org-1', users: [{ user: { ...USER } }] };
    }),
    addUserToOrg: jest.fn(),
  };
  const email = { sendEmail: jest.fn().mockResolvedValue(undefined) };
  const provider = {
    getUser: jest.fn().mockResolvedValue({ id: 'google-1', email: 'g@b.c' }),
  };
  const providers = { getProvider: jest.fn().mockReturnValue(provider) };
  const service = new AuthService(
    users as unknown as UsersService,
    organizations as unknown as OrganizationService,
    {} as NotificationService,
    email as unknown as EmailService,
    providers as unknown as AuthProviderManager,
    new TrackService()
  );

  return { service, order, users, organizations, email, provider };
};

type Doubles = ReturnType<typeof makeService>;

const emailBody = (fields: Record<string, string> = {}) =>
  Object.assign(new CreateOrgUserDto(), {
    email: 'a@b.c',
    password: PASSWORD,
    company: 'Acme',
    provider: Provider.LOCAL,
    ...fields,
  });

const providerBody = (fields: Record<string, string> = {}) =>
  Object.assign(new CreateOrgUserDto(), {
    company: 'Acme',
    provider: Provider.GOOGLE,
    providerToken: 'google-token',
    ...fields,
  });

const activationCode = () =>
  AuthChecker.signJWT({ id: 'user-1', email: 'a@b.c', activated: false });

// Each flow reports what it returned; the doubles record what it called.
const flows: Array<[string, (doubles: Doubles) => Promise<unknown>]> = [
  [
    'an email sign-up',
    ({ service }) =>
      service.routeAuth(
        Provider.LOCAL,
        emailBody({ utm_source: 'twitter', ref: 'home-hero' }),
        IP,
        AGENT
      ),
  ],
  [
    'a provider sign-up',
    ({ service }) =>
      service.routeAuth(
        Provider.GOOGLE,
        providerBody({ gclid: 'g-1' }),
        IP,
        AGENT
      ),
  ],
  [
    'an activation',
    ({ service, users }) => {
      users.getUserByEmail.mockResolvedValue({ ...USER, activated: false });
      return service.activate(activationCode(), '');
    },
  ],
];

const run = async (
  flow: (doubles: Doubles) => Promise<unknown>,
  arrange: () => void = () => undefined
) => {
  jest.clearAllMocks();
  const doubles = makeService();
  arrange();
  const result = await flow(doubles);
  const { users, organizations, email, provider } = doubles;

  return {
    result,
    calls: [
      users.getUserByEmail.mock.calls,
      users.getUserByProvider.mock.calls,
      users.activateUser.mock.calls,
      organizations.createOrgAndUser.mock.calls,
      organizations.addUserToOrg.mock.calls,
      email.sendEmail.mock.calls,
      provider.getUser.mock.calls,
      mockNewsletterRegister.mock.calls,
    ],
  };
};

beforeEach(() => {
  // Tokens carry the time they were signed; a fixed clock makes two runs of
  // the same flow return the same token.
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-24T09:00:00.000Z'));
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
  process.env.NEXT_PUBLIC_POSTHOG_HOST = 'https://eu.i.posthog.com';
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
});

describe('AuthService sign-up events', () => {
  it('records signed_up once the email account exists, with the arrival set once on the person', async () => {
    const { service, order } = makeService();

    const result = await service.routeAuth(
      Provider.LOCAL,
      emailBody({ utm_source: 'twitter', ref: 'home-hero' }),
      IP,
      AGENT
    );

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'signed_up',
      properties: {
        provider: 'LOCAL',
        organization_id: 'org-1',
        $set_once: {
          $initial_utm_source: 'twitter',
          $initial_ref: 'home-hero',
        },
      },
    });
    expect(order).toEqual(['db', 'capture']);
    expect(result).toEqual({ addedOrg: false, jwt: expect.any(String) });
  });

  it('records signed_up once a provider creates the account', async () => {
    const { service, order } = makeService();

    await service.routeAuth(
      Provider.GOOGLE,
      providerBody({ utm_source: 'google', gclid: 'g-1' }),
      IP,
      AGENT
    );

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'signed_up',
      properties: {
        provider: 'GOOGLE',
        organization_id: 'org-1',
        $set_once: { $initial_utm_source: 'google', $initial_gclid: 'g-1' },
      },
    });
    expect(order).toEqual(['db', 'capture']);
  });

  it('records nothing when a provider signs in an existing account', async () => {
    const { service, users, organizations } = makeService();
    users.getUserByProvider.mockResolvedValue({ ...USER, activated: true });

    await service.routeAuth(Provider.GOOGLE, providerBody(), IP, AGENT);

    expect(organizations.createOrgAndUser).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('records nothing when an email account signs in', async () => {
    const { service, users } = makeService();
    users.getUserByEmail.mockResolvedValue({
      ...USER,
      activated: true,
      password: AuthChecker.hashPassword(PASSWORD),
    });

    await service.routeAuth(
      Provider.LOCAL,
      Object.assign(new LoginUserDto(), {
        email: 'a@b.c',
        password: PASSWORD,
        provider: Provider.LOCAL,
      }),
      IP,
      AGENT
    );

    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('drops an attribution value it cannot keep and still registers', async () => {
    const { service } = makeService();

    const result = await service.routeAuth(
      Provider.LOCAL,
      emailBody({ utm_source: 'a'.repeat(257), junk: 'x', ref: 'home-hero' }),
      IP,
      AGENT
    );

    expect(mockCapture.mock.calls[0][0].properties.$set_once).toEqual({
      $initial_ref: 'home-hero',
    });
    expect(result).toEqual({ addedOrg: false, jwt: expect.any(String) });
  });

  it('never sends a login token the stored arrival set carries', async () => {
    const { service } = makeService();

    await service.routeAuth(
      Provider.LOCAL,
      emailBody({
        utm_source: 'twitter',
        landing_url: 'https://dash.sharek.app/auth/forgot/abc.def.ghi',
      }),
      IP,
      AGENT
    );

    expect(mockCapture.mock.calls[0][0].properties.$set_once).toEqual({
      $initial_utm_source: 'twitter',
    });
  });

  it.each([
    ['an email', () => emailBody()],
    ['a provider', () => providerBody()],
  ])(
    'records nothing when %s account cannot be created',
    async (_, body) => {
      const { service, organizations } = makeService();
      organizations.createOrgAndUser.mockRejectedValue(new Error('db down'));
      const posted = body();

      await expect(
        service.routeAuth(posted.provider, posted, IP, AGENT)
      ).rejects.toThrow('db down');
      expect(mockCapture).not.toHaveBeenCalled();
    }
  );

  // FR-009: nothing here stores the set. The repository's create picks named
  // fields, so the attribution keys the body carries never reach a column.
  it('hands the body to account creation as posted', async () => {
    const { service, organizations } = makeService();
    const body = emailBody({ utm_source: 'twitter' });

    await service.routeAuth(Provider.LOCAL, body, IP, AGENT);

    expect(organizations.createOrgAndUser).toHaveBeenCalledWith(
      body,
      IP,
      AGENT
    );
  });
});

describe('AuthService activation event', () => {
  it('records activated once the account is activated', async () => {
    const { service, order, users } = makeService();
    users.getUserByEmail.mockResolvedValue({ ...USER, activated: false });

    await service.activate(activationCode(), '');

    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'activated',
      properties: {},
    });
    expect(order).toEqual(['db', 'capture']);
  });

  it('records nothing when the activation cannot be written', async () => {
    const { service, users } = makeService();
    users.getUserByEmail.mockResolvedValue({ ...USER, activated: false });
    users.activateUser.mockRejectedValue(new Error('db down'));

    await expect(service.activate(activationCode(), '')).rejects.toThrow(
      'db down'
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('records nothing when the account was already active', async () => {
    const { service, users } = makeService();
    users.getUserByEmail.mockResolvedValue({ ...USER, activated: true });

    expect(await service.activate(activationCode(), '')).toBe(false);
    expect(users.activateUser).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

// FR-017: analytics never changes what a sign-up or an activation returns or
// calls, whatever state PostHog is in. A failed delivery is not a mode here:
// posthog-node reports it on its emitter from a flush that runs after the
// handler has returned, and the TrackService spec covers that listener.
const failures: Array<[string, () => void]> = [
  [
    'the PostHog client throws',
    () =>
      mockCapture.mockImplementation(() => {
        throw new Error('boom');
      }),
  ],
  [
    'PostHog is not configured',
    () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    },
  ],
];

describe.each(failures)('when %s', (_, arrange) => {
  it.each(flows)(
    '%s returns and calls what it does when the event is recorded',
    async (_name, flow) => {
      const recorded = await run(flow);
      const failing = await run(flow, arrange);

      expect(failing.result).toEqual(recorded.result);
      expect(failing.calls).toEqual(recorded.calls);
    }
  );
});
