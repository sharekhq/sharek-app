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
