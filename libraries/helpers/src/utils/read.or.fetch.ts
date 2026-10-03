import { readFileSync, statSync } from 'fs';
import axios from 'axios';
import type { AxiosError } from 'axios';

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

// With `maxBytes`, the size is learned before any body is read, the way
// SocialAbstract.mediaSize learns it: a HEAD in identity encoding (so the
// length is that of the bytes a GET returns), or a stat for a local file. The
// GET still carries the bound, in case a header is missing or wrong.
export const readOrFetch = async (path: string, maxBytes?: number) => {
  if (path.indexOf('http') === 0) {
    if (maxBytes !== undefined) {
      const head = await axios.head(path, {
        headers: { 'accept-encoding': 'identity' },
      });
      const size = Number(head.headers['content-length']);
      if (size > maxBytes) {
        throw new MediaTooLargeError(maxBytes, size);
      }
    }

    try {
      return (
        await axios({
          url: path,
          method: 'GET',
          responseType: 'arraybuffer',
          ...(maxBytes !== undefined && { maxContentLength: maxBytes }),
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

  if (maxBytes !== undefined) {
    const { size } = statSync(path);
    if (size > maxBytes) {
      throw new MediaTooLargeError(maxBytes, size);
    }
  }

  return readFileSync(path);
};
