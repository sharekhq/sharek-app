// readOrFetch has one caller, MediaService.loadReferences (spec 031): the AI
// image references, which must not read an unbounded file. Providers read media
// through SocialAbstract.readOrFetch. The Media library's
// multipart upload path never checks a size on the server, so a stored file
// can be any size, and a reference is read into the memory of the one backend
// process. With a bound the size is learned before any body is read, the way
// SocialAbstract.mediaSize learns it (feature 031-ai-image-references-edit,
// research R5). The stored path is user-influenced, so it is read under
// SocialAbstract's rules too: a local file only inside UPLOAD_DIRECTORY, a URL
// only through the SSRF-safe client and with a deadline.
const mockClient = Object.assign(jest.fn(), { head: jest.fn() });
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ getSsrfSafeAxios: jest.fn() })
);
jest.mock('fs', () => ({ readFileSync: jest.fn(), statSync: jest.fn() }));

import { readFileSync, statSync } from 'fs';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { MediaTooLargeError, readOrFetch } from './read.or.fetch';

const ssrfSafeAxios = getSsrfSafeAxios as unknown as jest.Mock;
const get = mockClient;
const head = mockClient.head;
const readFile = readFileSync as unknown as jest.Mock;
const stat = statSync as unknown as jest.Mock;

const MB = 1024 * 1024;
const BOUND = 30 * MB;
const URL = 'https://media/x.png';
const LOCAL = '/uploads/x.png';

const uploadDirectory = process.env.UPLOAD_DIRECTORY;

beforeEach(() => {
  jest.resetAllMocks();
  ssrfSafeAxios.mockReturnValue(mockClient);
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

describe('a local path outside UPLOAD_DIRECTORY', () => {
  it.each([
    ['a system file', '/etc/passwd'],
    ['a path that climbs out of it', '/uploads/../etc/passwd'],
    ['a sibling folder that shares its name', '/uploads-other/x.png'],
  ])('refuses %s without opening it', async (_label, path) => {
    await expect(readOrFetch(path, BOUND)).rejects.toThrow();

    expect(stat).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('refuses every local file while UPLOAD_DIRECTORY is unset', async () => {
    delete process.env.UPLOAD_DIRECTORY;

    await expect(readOrFetch(LOCAL)).rejects.toThrow();
    expect(readFile).not.toHaveBeenCalled();
  });
});

// The real client, against a server on this machine.
describe('a URL whose host resolves to a private address', () => {
  const ssrfSetting = process.env.DISABLE_SSRF_PROTECTION;

  afterEach(() => {
    if (ssrfSetting === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = ssrfSetting;
    }
  });

  it('is refused before any request leaves', async () => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    ssrfSafeAxios.mockImplementation(
      jest.requireActual(
        '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher'
      ).getSsrfSafeAxios
    );
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      res.end('BYTES');
    });
    // every address, so localhost answers whichever family it resolves to
    await new Promise<void>((done) => server.listen(0, done));

    try {
      await expect(
        readOrFetch(
          `http://localhost:${(server.address() as AddressInfo).port}/x.png`
        )
      ).rejects.toThrow();
      expect(requests).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  });
});
