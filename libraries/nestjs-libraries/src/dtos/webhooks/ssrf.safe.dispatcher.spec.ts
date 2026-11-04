// The real check unless a case says otherwise: every local address is blocked,
// so two cases let one through to stand in for a public server.
jest.mock('./webhook.url.validator', () => {
  const actual = jest.requireActual('./webhook.url.validator');
  return { ...actual, isBlockedIp: jest.fn() };
});

import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { isBlockedIp } from './webhook.url.validator';
import {
  getSsrfSafeAxios,
  getSsrfSafeDispatcher,
} from './ssrf.safe.dispatcher';

const blockedIp = isBlockedIp as jest.Mock;

// Real requests against a real local server: Node skips the `lookup` hook for a
// host that is already an IP address, which only shows on an actual connection.
describe('the SSRF-safe clients', () => {
  const ssrfSetting = process.env.DISABLE_SSRF_PROTECTION;
  let server: Server;
  let port: number;
  let reached: string[];

  beforeAll(async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    server = createServer((req, res) => {
      reached.push(req.url!);
      if (req.url === '/hop') {
        res.writeHead(302, { location: `http://[::1]:${port}/after-hop` });
        return res.end();
      }
      res.end('reached');
    });
    // every address, so each form of loopback below would answer
    await new Promise<void>((done) => server.listen(0, done));
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(() => {
    reached = [];
    blockedIp.mockImplementation(
      jest.requireActual('./webhook.url.validator').isBlockedIp
    );
  });

  afterAll(async () => {
    if (ssrfSetting === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = ssrfSetting;
    }
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });

  const clients: [string, (url: string) => Promise<number>][] = [
    [
      'fetch',
      async (url) =>
        (await fetch(url, { dispatcher: getSsrfSafeDispatcher() } as any))
          .status,
    ],
    ['axios', async (url) => (await getSsrfSafeAxios().get(url)).status],
  ];

  // fetch wraps the reason in `cause`, axios keeps it as the message
  const reasonFor = (request: Promise<number>) =>
    request.then(
      () => 'allowed',
      (err) => err.cause?.message ?? err.message
    );

  describe.each(clients)('%s', (_name, request) => {
    it.each([
      ['an IPv4 address', () => `http://127.0.0.1:${port}/`],
      ['an https address', () => `https://127.0.0.1:${port}/`],
      ['an IPv4 address in decimal', () => `http://2130706433:${port}/`],
      ['an IPv6 address', () => `http://[::1]:${port}/`],
      ['an IPv4-mapped address', () => `http://[::ffff:127.0.0.1]:${port}/`],
      ['a host name', () => `http://localhost:${port}/`],
    ])('refuses loopback given as %s', async (_form, url) => {
      await expect(reasonFor(request(url()))).resolves.toBe('Blocked IP');
      expect(reached).toEqual([]);
    });

    it('refuses a blocked address a redirect points at', async () => {
      blockedIp.mockImplementation((ip: string) => ip === '::1');

      await expect(
        reasonFor(request(`http://127.0.0.1:${port}/hop`))
      ).resolves.toBe('Blocked IP');
      expect(reached).toEqual(['/hop']);
    });

    it('connects to an address the guard allows', async () => {
      blockedIp.mockImplementation(() => false);

      await expect(request(`http://127.0.0.1:${port}/ok`)).resolves.toBe(200);
      expect(reached).toEqual(['/ok']);
    });
  });

  // The agents live as long as the process, and the address comes from outside
  describe('a refused axios request', () => {
    const settled = () => new Promise((done) => setImmediate(done));

    it.each([
      ['http', 'httpAgent'],
      ['https', 'httpsAgent'],
    ] as const)(
      'leaves nothing behind on the %s agent',
      async (scheme, key) => {
        const client = getSsrfSafeAxios();

        await reasonFor(client.get(`${scheme}://127.0.0.2:1/`) as any);
        await settled();

        expect(
          Object.keys(client.defaults[key].sockets).filter((name) =>
            name.startsWith('127.0.0.2')
          )
        ).toEqual([]);
      }
    );

    it('closes a stream it was sending', async () => {
      const body = Readable.from(['bytes']);

      await reasonFor(
        getSsrfSafeAxios().post('http://127.0.0.2:1/', body) as any
      );
      await settled();

      expect(body.destroyed).toBe(true);
    });
  });
});
