import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorage } from './local.storage';

// removeFile takes a stored media name or path, so it may only ever delete a
// file inside the upload directory.
describe('LocalStorage.removeFile', () => {
  const frontendUrl = process.env.FRONTEND_URL;
  let root: string;
  let uploads: string;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://dash.example';
    root = mkdtempSync(join(tmpdir(), 'sharek-storage-'));
    uploads = join(root, 'uploads');
    mkdirSync(join(uploads, '2026'), { recursive: true });
    writeFileSync(join(uploads, '2026', 'a.png'), 'a');
    writeFileSync(join(root, 'outside.txt'), 'outside');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (frontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = frontendUrl;
    }
  });

  it.each([
    ['a path outside it', () => join(root, 'outside.txt')],
    ['a path that climbs out of it', () => `${uploads}/../outside.txt`],
    [
      'a public URL that climbs out of it',
      () => 'https://dash.example/uploads/../outside.txt',
    ],
  ])('refuses %s and deletes nothing', async (_label, path) => {
    await expect(new LocalStorage(uploads).removeFile(path())).rejects.toThrow(
      'Unsafe file path'
    );
    expect(existsSync(join(root, 'outside.txt'))).toBe(true);
  });

  it.each([
    ['its path', () => join(uploads, '2026', 'a.png')],
    ['its public URL', () => 'https://dash.example/uploads/2026/a.png'],
  ])('deletes a file inside it by %s', async (_label, path) => {
    await new LocalStorage(uploads).removeFile(path());

    expect(existsSync(join(uploads, '2026', 'a.png'))).toBe(false);
  });
});
