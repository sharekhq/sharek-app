import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { BadBody, SocialAbstract } from './social.abstract';

class MediaReader extends SocialAbstract {
  identifier = 'media-reader';
}

// the readers are protected
const reader = new MediaReader() as any;

const text = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString();
};

// Every local reader as the providers call it, and what it answers for the
// six-byte file inside the upload directory.
const readers: [string, (path: string) => Promise<unknown>, unknown][] = [
  [
    'readOrFetch',
    async (path) => (await reader.readOrFetch(path)).toString(),
    'inside',
  ],
  ['mediaSize', (path) => reader.mediaSize(path), 6],
  [
    'mediaChunk',
    async (path) => (await reader.mediaChunk(path, 0, 3)).toString(),
    'insi',
  ],
  [
    'mediaStream',
    async (path) => text(await reader.mediaStream(path)),
    'inside',
  ],
];

// A provider reads a post's media from the worker's disk when the stored path
// is not a URL. That path is user-influenced, so only a file inside
// UPLOAD_DIRECTORY may be opened.
describe('SocialAbstract local media reads', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  let root: string;
  let uploads: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'sharek-media-'));
    uploads = join(root, 'uploads');
    mkdirSync(uploads);
    mkdirSync(`${uploads}-other`);
    writeFileSync(join(uploads, 'inside.txt'), 'inside');
    writeFileSync(join(root, 'outside.txt'), 'outside');
    writeFileSync(join(`${uploads}-other`, 'sibling.txt'), 'sibling');
  });

  beforeEach(() => {
    process.env.UPLOAD_DIRECTORY = uploads;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    if (uploadDirectory === undefined) {
      delete process.env.UPLOAD_DIRECTORY;
    } else {
      process.env.UPLOAD_DIRECTORY = uploadDirectory;
    }
  });

  describe.each(readers)('%s', (_name, read, inside) => {
    it.each([
      ['a system file', () => '/etc/passwd'],
      ['a path that climbs out of it', () => `${uploads}/../outside.txt`],
      [
        'a sibling folder that shares its name',
        () => `${uploads}-other/sibling.txt`,
      ],
    ])('refuses %s', async (_label, path) => {
      await expect(read(path())).rejects.toBeInstanceOf(BadBody);
    });

    it('refuses every local file while UPLOAD_DIRECTORY is unset', async () => {
      delete process.env.UPLOAD_DIRECTORY;

      await expect(read(join(uploads, 'inside.txt'))).rejects.toBeInstanceOf(
        BadBody
      );
    });

    it('reads a file inside UPLOAD_DIRECTORY', async () => {
      await expect(read(join(uploads, 'inside.txt'))).resolves.toBe(inside);
    });
  });
});
