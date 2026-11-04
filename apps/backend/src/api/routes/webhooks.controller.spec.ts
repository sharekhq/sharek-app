// The controller's imports pull in Prisma; none of that code runs here, so the
// module is swapped for a shell (same pattern as enterprise.controller.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class {} })
);

import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { WebhookController } from './webhooks.controller';

// The DTO checks the address once, so a redirect or a changed DNS answer can
// still end somewhere internal: the request itself has to go through the guard.
describe('WebhookController.sendWebhook', () => {
  const ssrfSetting = process.env.DISABLE_SSRF_PROTECTION;
  const controller = new WebhookController({} as any);
  let server: Server;
  let url: string;
  let received: { method?: string; body: string }[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ method: req.method, body });
        res.end();
      });
    });
    // no host: every address, so localhost answers whichever way it resolves
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://localhost:${(server.address() as AddressInfo).port}/`;
  });

  beforeEach(() => {
    received = [];
  });

  afterEach(() => {
    if (ssrfSetting === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = ssrfSetting;
    }
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  it('sends nothing to an internal address', async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;

    await expect(controller.sendWebhook({ a: 1 }, { url })).resolves.toEqual({
      send: true,
    });
    expect(received).toEqual([]);
  });

  // Self-hosters opt out to reach webhooks on their own network
  it('delivers the payload where the guard is switched off', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';

    await controller.sendWebhook({ a: 1 }, { url });

    expect(received).toEqual([{ method: 'POST', body: '{"a":1}' }]);
  });
});
