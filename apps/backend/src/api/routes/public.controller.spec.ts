// AuthService signs and verifies every token with this secret.
process.env.JWT_SECRET = 'test';

// The controller's imports pull in Prisma, PostHog and the agent graph; none of
// that code runs here, so the modules are swapped for shells (same pattern as
// enterprise.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.insert.service', () => ({
  AgentGraphInsertService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
// The stream re-checks every hop, which needs DNS; the remote is a double here.
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator',
  () => ({
    ...jest.requireActual(
      '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
    ),
    isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
  })
);

import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { PublicController } from './public.controller';

const makeController = () => {
  const modifySubscriptionByOrg = jest.fn().mockResolvedValue(undefined);

  return {
    controller: new PublicController(
      {} as any,
      {} as any,
      {} as any,
      { modifySubscriptionByOrg } as any
    ),
    modifySubscriptionByOrg,
  };
};

// The route sits outside AuthMiddleware and sets an organization's plan, so it
// acts only on a billing token, never on another token the app signs with the
// same secret.
describe('PublicController.modifySubscription', () => {
  it('sets the plan a billing token names', async () => {
    const { controller, modifySubscriptionByOrg } = makeController();

    await expect(
      controller.modifySubscription(
        AuthService.signJWT({ orgId: 'org-1', billing: 'PRO' })
      )
    ).resolves.toEqual({ success: true });
    expect(modifySubscriptionByOrg).toHaveBeenCalledWith(
      'org-1',
      pricing.PRO.channel,
      'PRO'
    );
  });

  it.each([
    // The invite used to sign the whole request body, so an organization
    // admin could add a plan to it and unlock channels above their own.
    [
      'a team invite token that carries a plan',
      {
        email: 'new@example.com',
        role: 'ADMIN',
        sendEmail: false,
        billing: 'ULTIMATE',
        orgId: 'org-1',
        timeLimit: '2026-10-28 12:00:00',
        id: 'a1b2c',
      },
    ],
    [
      'an organization that is not a string',
      { orgId: { not: '' }, billing: 'PRO' },
    ],
  ])('refuses %s', async (_label, payload) => {
    const { controller, modifySubscriptionByOrg } = makeController();

    await expect(
      controller.modifySubscription(AuthService.signJWT(payload))
    ).resolves.toEqual({ success: false });
    expect(modifySubscriptionByOrg).not.toHaveBeenCalled();
  });
});

// The route needs no login and fetches any public address ending in mp4, so the
// remote must not get to decide how a browser treats the answer: served as a
// page, it would run on the app's own domain.
describe('PublicController.streamFile', () => {
  const realFetch = global.fetch;
  const url = 'https://remote.example/video.mp4';
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const { controller } = makeController();
    const app = express();
    app.get('/stream', (req, res) => controller.streamFile({ url }, res, req));
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  const stream = async (remote: Response) => {
    global.fetch = jest.fn().mockResolvedValue(remote);
    return realFetch(`${base}/stream`);
  };

  it('answers video whatever type the remote claims', async () => {
    const response = await stream(
      new Response('<script>alert(1)</script>', {
        headers: { 'content-type': 'text/html' },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  // Seeking is a Range request: the thumbnail picker needs the partial answer
  it('keeps a partial answer seekable', async () => {
    const response = await stream(
      new Response('bytes', {
        status: 206,
        headers: {
          'content-type': 'application/octet-stream',
          'content-range': 'bytes 0-4/100',
        },
      })
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 0-4/100');
    expect(await response.text()).toBe('bytes');
  });
});
