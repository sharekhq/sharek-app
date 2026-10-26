import { readFileSync, statSync } from 'fs';
import { resolve, sep } from 'path';
import type { AxiosError } from 'axios';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

// The deadline SocialAbstract's media reads use: a healthy read finishes in
// seconds, so it only ever ends a stalled transfer.
const MEDIA_READ_TIMEOUT = 120_000;

/**
 * A file over the bound a caller passed to readOrFetch. `size` is unknown when
 * the download's own bound caught it, because no length came ahead of it.
 */
export class MediaTooLargeError extends Error {
  constructor(public readonly maxBytes: number, public readonly size?: number) {
    super(`The file is over the ${maxBytes}-byte limit`);
    this.name = 'MediaTooLargeError';
  }
}

// The stored path is user-influenced, so a local file is opened only inside
// UPLOAD_DIRECTORY: resolve() collapses any `..` segments before the
// comparison, the check SocialAbstract.localMediaPath makes.
const localMediaPath = (path: string) => {
  const base = process.env.UPLOAD_DIRECTORY
    ? resolve(process.env.UPLOAD_DIRECTORY)
    : '';
  const filePath = resolve(path);
  if (!base || !filePath.startsWith(base + sep)) {
    throw new Error('The media is not in the upload directory');
  }

  return filePath;
};

// With `maxBytes`, the size is learned before any body is read, the way
// SocialAbstract.mediaSize learns it: a HEAD in identity encoding (so the
// length is that of the bytes a GET returns), or a stat for a local file. The
// GET still carries the bound, in case a header is missing or wrong. A URL is
// read through the same SSRF-safe client as the providers' media reads.
export const readOrFetch = async (path: string, maxBytes?: number) => {
  if (path.indexOf('http') === 0) {
    if (maxBytes !== undefined) {
      const head = await getSsrfSafeAxios().head(path, {
        headers: { 'accept-encoding': 'identity' },
        signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT),
      });
      const size = Number(head.headers['content-length']);
      if (size > maxBytes) {
        throw new MediaTooLargeError(maxBytes, size);
      }
    }

    try {
      return (
        await getSsrfSafeAxios()({
          url: path,
          method: 'GET',
          responseType: 'arraybuffer',
          ...(maxBytes !== undefined && { maxContentLength: maxBytes }),
          signal: AbortSignal.timeout(MEDIA_READ_TIMEOUT),
        })
      ).data;
    } catch (err) {
      // axios rejects a body past maxContentLength with ERR_BAD_RESPONSE and no
      // response attached; a 5xx carries the same code with its response.
      if (
        maxBytes !== undefined &&
        (err as AxiosError).code === 'ERR_BAD_RESPONSE' &&
        !(err as AxiosError).response
      ) {
        throw new MediaTooLargeError(maxBytes);
      }
      throw err;
    }
  }

  const filePath = localMediaPath(path);
  if (maxBytes !== undefined) {
    const { size } = statSync(filePath);
    if (size > maxBytes) {
      throw new MediaTooLargeError(maxBytes, size);
    }
  }

  return readFileSync(filePath);
};
