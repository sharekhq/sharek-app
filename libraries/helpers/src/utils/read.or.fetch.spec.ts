// readOrFetch has one caller, MediaService.loadReferences (spec 031): the AI
// image references, which must not read an unbounded file. Providers read media
// through SocialAbstract.readOrFetch. The Media library's
// multipart upload path never checks a size on the server, so a stored file
// can be any size, and a reference is read into the memory of the one backend
// process. With a bound the size is learned before any body is read, the way
// SocialAbstract.mediaSize learns it (feature 031-ai-image-references-edit,
// research R5).
jest.mock('axios', () => {
  const axios = Object.assign(jest.fn(), { head: jest.fn() });
  return { __esModule: true, default: axios };
});
jest.mock('fs', () => ({ readFileSync: jest.fn(), statSync: jest.fn() }));

import axios from 'axios';
import { readFileSync, statSync } from 'fs';
import { MediaTooLargeError, readOrFetch } from './read.or.fetch';

const get = axios as unknown as jest.Mock;
const head = axios.head as unknown as jest.Mock;
const readFile = readFileSync as unknown as jest.Mock;
const stat = statSync as unknown as jest.Mock;

const MB = 1024 * 1024;
const BOUND = 30 * MB;
const URL = 'https://media/x.png';
const LOCAL = '/uploads/x.png';

beforeEach(() => {
  jest.resetAllMocks();
  get.mockResolvedValue({ data: Buffer.from('BYTES') });
  readFile.mockReturnValue(Buffer.from('LOCAL-BYTES'));
});

// Without a bound the helper reads the whole file, as before.
describe('without a bound', () => {
  it('fetches a URL in one GET and asks for no size first', async () => {
    await expect(readOrFetch(URL)).resolves.toEqual(Buffer.from('BYTES'));

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({
      url: URL,
      method: 'GET',
      responseType: 'arraybuffer',
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
  it('asks the HEAD for the unencoded length', async () => {
    head.mockResolvedValue({ headers: { 'content-length': String(MB) } });

    await readOrFetch(URL, BOUND);

    expect(head).toHaveBeenCalledWith(URL, {
      headers: { 'accept-encoding': 'identity' },
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
