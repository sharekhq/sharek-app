// The controller's imports pull in Prisma and the providers; none of that code
// runs here, so the modules are swapped for shells (same pattern as
// enterprise.controller.spec).
jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/farcaster.provider',
  () => ({ FarcasterProvider: class {} })
);
jest.mock('@gitroom/nestjs-libraries/throttler/throttler.provider', () => ({
  ThrottlerRealIpGuard: class {},
}));

import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { AuthController } from './auth.controller';

describe('AuthController, a refused login or sign-up', () => {
  // An auth error can carry what the request sent: AuthProviderManager puts the
  // provider it was asked for in its message.
  const message = 'Auth provider <b>x</b> not found';
  let server: Server;
  let base: string;

  // Through real Express, because the response type is what Express picks for a
  // bare string, and that default is what this guards against.
  beforeAll(async () => {
    const controller = new AuthController(
      {
        getOrgFromCookie: () => false,
        routeAuth: jest.fn().mockRejectedValue(new Error(message)),
      } as any,
      {} as any
    );
    const app = express();
    app.post('/login', (req, res) =>
      controller.login(req, {} as any, res, 'ip', 'agent')
    );
    app.post('/register', (req, res) =>
      controller.register(req, {} as any, res, 'ip', 'agent')
    );
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  it.each(['login', 'register'])(
    '%s answers with plain text, so a browser never renders it as a page',
    async (route) => {
      const response = await fetch(`${base}/${route}`, { method: 'POST' });

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8'
      );
      // login.tsx and register.tsx show this text under the email field
      expect(await response.text()).toBe(message);
    }
  );
});
