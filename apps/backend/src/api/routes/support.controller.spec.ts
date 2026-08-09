// The controller's imports drag Prisma and the Zoho service in behind it; none
// of that code runs here, so the service module is swapped for an empty shell
// (same pattern as media.controller.spec).
jest.mock('@gitroom/nestjs-libraries/services/support.service', () => ({
  SupportService: class {},
}));

import { HttpException } from '@nestjs/common';
import { SupportController } from './support.controller';
import { SupportThrottlerGuard } from '@gitroom/nestjs-libraries/throttler/support.throttler.guard';

const ZOHO_VARIABLES = [
  'ZOHO_DESK_DC',
  'ZOHO_DESK_ORG_ID',
  'ZOHO_DESK_DEPARTMENT_ID',
  'ZOHO_DESK_CLIENT_ID',
  'ZOHO_DESK_CLIENT_SECRET',
  'ZOHO_DESK_REFRESH_TOKEN',
];

beforeEach(() => {
  ZOHO_VARIABLES.forEach((name) => {
    process.env[name] = 'configured';
  });
});

afterEach(() => {
  ZOHO_VARIABLES.forEach((name) => delete process.env[name]);
});

const user = {
  id: 'user-1',
  name: 'Moataz Khalifa',
  email: 'mo@concepta.digital',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
} as any;

// role lives on the membership, not the account: the same person is ADMIN in one
// organisation and USER in another (research R11).
const organization = {
  id: 'org-1',
  name: 'Concepta',
  users: [{ role: 'ADMIN' }],
  subscription: { subscriptionTier: 'STANDARD', isLifetime: false },
  isTrailing: false,
} as any;

const enquiry = {
  category: 'channels',
  subject: 'Instagram stopped posting',
  message: 'Since Tuesday my scheduled posts fail.',
  locale: 'ar',
} as any;

const request = { cookies: {}, headers: {} } as any;

const makeController = (createTicket = jest.fn().mockResolvedValue('110')) => ({
  controller: new SupportController({ createTicket } as any),
  createTicket,
});

const senderFrom = (createTicket: jest.Mock) => createTicket.mock.calls[0][0];

describe('SupportController', () => {
  it('answers with the reference the help desk issued', async () => {
    const { controller } = makeController();

    await expect(
      controller.createTicket(user, organization, request, enquiry)
    ).resolves.toEqual({ ticketNumber: '110' });
  });

  it('passes the enquiry through untouched', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, request, enquiry);

    expect(createTicket.mock.calls[0][1]).toBe(enquiry);
  });

  it('assembles the sender from the session', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, request, enquiry);

    expect(senderFrom(createTicket)).toMatchObject({
      userId: 'user-1',
      name: 'Moataz Khalifa',
      email: 'mo@concepta.digital',
      organizationId: 'org-1',
      organizationName: 'Concepta',
      tier: 'STANDARD',
    });
  });

  // The whole point of assembling server-side: a client that sends its own plan
  // or organisation is ignored, not trusted.
  it('ignores identity the client tried to send in the body', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, request, {
      ...enquiry,
      email: 'attacker@example.com',
      tier: 'ULTIMATE',
      role: 'SUPERADMIN',
      organizationName: 'Someone Else',
    });

    expect(senderFrom(createTicket)).toMatchObject({
      email: 'mo@concepta.digital',
      tier: 'STANDARD',
      role: 'ADMIN',
      organizationName: 'Concepta',
    });
  });

  it('takes role from the active membership, not the user record', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(
      user,
      { ...organization, users: [{ role: 'USER' }], role: 'ADMIN' },
      request,
      enquiry
    );

    expect(senderFrom(createTicket).role).toBe('USER');
  });

  it('falls back to FREE when the organisation has no subscription', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(
      user,
      { ...organization, subscription: undefined },
      request,
      enquiry
    );

    expect(senderFrom(createTicket)).toMatchObject({
      tier: 'FREE',
      isLifetime: false,
    });
  });

  it.each([
    ['a cookie', { cookies: { impersonate: 'user-9' }, headers: {} }],
    ['a header', { cookies: {}, headers: { impersonate: 'user-9' } }],
  ])('marks an impersonated session carried by %s', async (_how, req) => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, req as any, enquiry);

    expect(senderFrom(createTicket).isImpersonating).toBe(true);
  });

  it('leaves an ordinary session unmarked', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, request, enquiry);

    expect(senderFrom(createTicket).isImpersonating).toBe(false);
  });

  it('derives the account age from the user record', async () => {
    const { controller, createTicket } = makeController();

    await controller.createTicket(user, organization, request, enquiry);

    expect(senderFrom(createTicket).accountAgeDays).toBeGreaterThan(0);
  });
});

// Unreachable through the UI — the menu entry and the page are both hidden when
// the credentials are absent — so this is only what a direct call meets. It
// answers plainly instead of letting the service dial a host built out of
// `undefined` and blame a help desk that was never configured.
describe('when the integration is unconfigured', () => {
  it.each(ZOHO_VARIABLES)('refuses when %s is missing', async (missing) => {
    delete process.env[missing];
    const { controller, createTicket } = makeController();

    await expect(
      controller.createTicket(user, organization, request, enquiry)
    ).rejects.toBeInstanceOf(HttpException);

    expect(createTicket).not.toHaveBeenCalled();
  });

  it('says what is actually wrong', async () => {
    delete process.env.ZOHO_DESK_REFRESH_TOKEN;
    const { controller } = makeController();

    const error = await controller
      .createTicket(user, organization, request, enquiry)
      .then(
        () => null,
        (thrown) => thrown as HttpException
      );

    expect(error!.getStatus()).toBe(400);
    expect(String(error!.getResponse())).toMatch(/not configured/i);
  });
});

// The global ThrottlerBehindProxyGuard short-circuits to `true` for every route
// except POST /public/v1/posts, so the @Throttle decorator alone would be inert
// here and FR-015 would silently not hold. The route carries its own guard.
describe('the rate limit', () => {
  const handler = SupportController.prototype.createTicket;

  // @Throttle stores each named throttler under `<KEY><name>`, so the `default`
  // throttler lands on `THROTTLER:LIMITdefault`. The constants are declared in
  // the package's types but not re-exported from its root, so importing them
  // yields undefined and silently builds the key `"undefineddefault"`.
  it('allows five enquiries an hour', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(3600000);
  });

  it('is enforced by a guard that actually runs on this route', () => {
    expect(Reflect.getMetadata('__guards__', handler) || []).toContain(
      SupportThrottlerGuard
    );
  });
});
