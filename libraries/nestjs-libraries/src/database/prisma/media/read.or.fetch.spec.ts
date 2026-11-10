// readOrFetch reads the AI image references in MediaService.loadReferences
// (spec 031), which must not read an unbounded file, and a brand's logo links
// in BrandWebsiteService (spec 053). Providers read media
// through SocialAbstract.readOrFetch. The Media library's
// multipart upload path never checks a size on the server, so a stored file
// can be any size, and a reference is read into the memory of the one backend
// process. With a bound the size is learned before any body is read, the way
// SocialAbstract.mediaSize learns it (feature 031-ai-image-references-edit,
// research R5). The stored path is user-influenced, so it is read under
// SocialAbstract's rules too: a local file only inside UPLOAD_DIRECTORY, a URL
// only through the SSRF-safe client and with a deadline.
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ getSsrfSafeAxios: jest.fn() })
);
jest.mock('fs', () => ({ readFileSync: jest.fn(), statSync: jest.fn() }));

import { readFileSync, statSync } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { MediaTooLargeError, readOrFetch } from './read.or.fetch';

const ssrfSafeAxios = getSsrfSafeAxios as unknown as jest.Mock;
const get = Object.assign(jest.fn(), { head: jest.fn() });
const head = get.head;
const readFile = readFileSync as unknown as jest.Mock;
const stat = statSync as unknown as jest.Mock;

const MB = 1024 * 1024;
const BOUND = 30 * MB;
const URL = 'https://media/x.png';
const LOCAL = '/uploads/x.png';

const uploadDirectory = process.env.UPLOAD_DIRECTORY;

beforeEach(() => {
  jest.resetAllMocks();
  ssrfSafeAxios.mockReturnValue(get);
  get.mockResolvedValue({ data: Buffer.from('BYTES') });
  readFile.mockReturnValue(Buffer.from('LOCAL-BYTES'));
  process.env.UPLOAD_DIRECTORY = '/uploads';
});

afterAll(() => {
  if (uploadDirectory === undefined) {
    delete process.env.UPLOAD_DIRECTORY;
  } else {
    process.env.UPLOAD_DIRECTORY = uploadDirectory;
  }
});

// Without a bound the helper reads the whole file, as before.
describe('without a bound', () => {
  it('fetches a URL in one GET with a deadline and asks for no size first', async () => {
    await expect(readOrFetch(URL)).resolves.toEqual(Buffer.from('BYTES'));

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({
      url: URL,
      method: 'GET',
      responseType: 'arraybuffer',
      signal: expect.any(AbortSignal),
    });
    expect(head).not.toHaveBeenCalled();
  });

  it('reads a local path without stating it first', async () => {
    await expect(readOrFetch(LOCAL)).resolves.toEqual(
      Buffer.from('LOCAL-BYTES')
    );

    expect(readFile).toHaveBeenCalledWith(LOCAL);
    expect(stat).not.toHaveBeenCalled();
  });
});

describe('with a bound', () => {
  it('refuses a URL whose HEAD is over it, without downloading it', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(BOUND + 1) } });

    const err = await readOrFetch(URL, BOUND).catch((e) => e);

    expect(err).toBeInstanceOf(MediaTooLargeError);
    expect(err).toMatchObject({ size: BOUND + 1, maxBytes: BOUND });
    expect(get).not.toHaveBeenCalled();
  });

  // A header can be absent or wrong, so the GET carries the bound as well.
  it('reads a URL within it in one GET that carries the bound', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(MB) } });

    await expect(readOrFetch(URL, BOUND)).resolves.toEqual(
      Buffer.from('BYTES')
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({
      url: URL,
      method: 'GET',
      responseType: 'arraybuffer',
      maxContentLength: BOUND,
      signal: expect.any(AbortSignal),
    });
  });

  // A HEAD with no usable length lets the GET start; its own bound must then
  // refuse the same way, not as whatever axios calls an oversized body.
  it('refuses a body over it when the HEAD gave no usable length', async () => {
    head.mockResolvedValue({ headers: {} });
    get.mockRejectedValue(
      Object.assign(new Error(`maxContentLength size of ${BOUND} exceeded`), {
        code: 'ERR_BAD_RESPONSE',
      })
    );

    const err = await readOrFetch(URL, BOUND).catch((e) => e);

    expect(err).toBeInstanceOf(MediaTooLargeError);
    expect(err).toMatchObject({ maxBytes: BOUND, size: undefined });
  });

  // Some hosts refuse a HEAD (a CDN's 403 or 405, a link signed for GET only)
  // or don't answer it in time, and serve the GET; its bound then holds.
  describe('when the HEAD is refused or fails', () => {
    const refused = (status: number) =>
      Object.assign(new Error(`Request failed with status code ${status}`), {
        code: 'ERR_BAD_REQUEST',
        response: { status },
      });

    it.each([
      ['refused with a 403', refused(403)],
      ['refused with a 405', refused(405)],
      [
        'out of time',
        Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }),
      ],
    ])(
      'reads a URL whose HEAD was %s in one GET that carries the bound',
      async (_, failure) => {
        head.mockRejectedValue(failure);

        await expect(readOrFetch(URL, BOUND)).resolves.toEqual(
          Buffer.from('BYTES')
        );

        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith({
          url: URL,
          method: 'GET',
          responseType: 'arraybuffer',
          maxContentLength: BOUND,
          signal: expect.any(AbortSignal),
        });
      }
    );

    it('refuses a body over it', async () => {
      head.mockRejectedValue(refused(405));
      get.mockRejectedValue(
        Object.assign(new Error(`maxContentLength size of ${BOUND} exceeded`), {
          code: 'ERR_BAD_RESPONSE',
        })
      );

      const err = await readOrFetch(URL, BOUND).catch((e) => e);

      expect(err).toBeInstanceOf(MediaTooLargeError);
      expect(err).toMatchObject({ maxBytes: BOUND, size: undefined });
    });

    it('passes the GET’s own refusal through as itself', async () => {
      head.mockRejectedValue(refused(403));
      const failure = refused(403);
      get.mockRejectedValue(failure);

      await expect(readOrFetch(URL, BOUND)).rejects.toBe(failure);
    });
  });

  // axios gives a 5xx the same code, with the response attached.
  it('passes a server error through as itself', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(MB) } });
    const failure = Object.assign(
      new Error('Request failed with status code 502'),
      { code: 'ERR_BAD_RESPONSE', response: { status: 502 } }
    );
    get.mockRejectedValue(failure);

    await expect(readOrFetch(URL, BOUND)).rejects.toBe(failure);
  });

  it('reads a file of exactly the bound', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(BOUND) } });

    await expect(readOrFetch(URL, BOUND)).resolves.toEqual(
      Buffer.from('BYTES')
    );
  });

  // Identity encoding, as mediaSize asks: a compressed answer's length is not
  // the size of the bytes the GET will read.
  it('asks the HEAD for the unencoded length, with a deadline', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(MB) } });

    await readOrFetch(URL, BOUND);

    expect(head).toHaveBeenCalledWith(URL, {
      headers: { 'accept-encoding': 'identity' },
      signal: expect.any(AbortSignal),
    });
  });

  it('refuses a local file over it before reading it', async () => {
    stat.mockReturnValue({ size: BOUND + 1 });

    const err = await readOrFetch(LOCAL, BOUND).catch((e) => e);

    expect(err).toBeInstanceOf(MediaTooLargeError);
    expect(stat).toHaveBeenCalledWith(LOCAL);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reads a local file within it', async () => {
    stat.mockReturnValue({ size: MB });

    await expect(readOrFetch(LOCAL, BOUND)).resolves.toEqual(
      Buffer.from('LOCAL-BYTES')
    );
  });
});

// A caller inside a deadline of its own, such as a brand's website lookup
// inside nginx's 95 s, gives each request a shorter wait; every other caller
// keeps SocialAbstract's 120 s.
describe('the wait for each request', () => {
  let timeout: jest.SpyInstance;

  beforeEach(() => {
    timeout = jest.spyOn(AbortSignal, 'timeout');
    head.mockResolvedValue({ headers: { 'content-length': String(MB) } });
  });

  afterEach(() => {
    timeout.mockRestore();
  });

  it('is 120 s for the HEAD and for the GET when the caller gives none', async () => {
    await readOrFetch(URL, BOUND);

    expect(timeout.mock.calls).toEqual([[120_000], [120_000]]);
  });

  it('is the one the caller gives, for the HEAD and for the GET', async () => {
    await readOrFetch(URL, BOUND, 5_000);

    expect(timeout.mock.calls).toEqual([[5_000], [5_000]]);
  });

  it('is the one the caller gives for a read with no bound', async () => {
    await readOrFetch(URL, undefined, 5_000);

    expect(timeout.mock.calls).toEqual([[5_000]]);
  });
});

describe('a local path outside UPLOAD_DIRECTORY', () => {
  it.each([
    ['a system file', '/etc/passwd'],
    ['a path that climbs out of it', '/uploads/../etc/passwd'],
    ['a sibling folder that shares its name', '/uploads-other/x.png'],
  ])('refuses %s without opening it', async (_label, path) => {
    await expect(readOrFetch(path, BOUND)).rejects.toThrow(
      'The media is not in the upload directory'
    );

    expect(stat).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('refuses every local file while UPLOAD_DIRECTORY is unset', async () => {
    delete process.env.UPLOAD_DIRECTORY;

    await expect(readOrFetch(LOCAL)).rejects.toThrow(
      'The media is not in the upload directory'
    );
    expect(readFile).not.toHaveBeenCalled();
  });
});

// The real client, against a server on this machine.
describe('a URL whose host resolves to a private address', () => {
  const ssrfSetting = process.env.DISABLE_SSRF_PROTECTION;
  let server: Server;
  let requests = 0;
  let url = '';

  beforeAll(async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    server = createServer((_req, res) => {
      requests++;
      res.end('BYTES');
    });
    // every address, so localhost answers whichever family it resolves to
    await new Promise<void>((done) => server.listen(0, done));
    url = `http://localhost:${(server.address() as AddressInfo).port}/x.png`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    if (ssrfSetting === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = ssrfSetting;
    }
  });

  // With a bound, the HEAD's refusal must not open the way for the GET.
  it.each([
    ['without a bound', undefined],
    ['with a bound', BOUND],
  ])('is refused before any request leaves, %s', async (_, bound) => {
    ssrfSafeAxios.mockImplementation(
      jest.requireActual(
        '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher'
      ).getSsrfSafeAxios
    );

    await expect(readOrFetch(url, bound)).rejects.toThrow();
    expect(requests).toBe(0);
  });
});
