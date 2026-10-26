import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TelegramProvider } from './telegram.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// node-telegram-bot-api uploads any existing local path it is handed, so a
// media path that is not a URL must be a file of the upload directory.
describe('TelegramProvider, the media it hands to the bot', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  let uploads: string;

  beforeAll(() => {
    uploads = mkdtempSync(join(tmpdir(), 'sharek-telegram-'));
    process.env.UPLOAD_DIRECTORY = uploads;
  });

  afterAll(() => {
    rmSync(uploads, { recursive: true, force: true });
    if (uploadDirectory === undefined) {
      delete process.env.UPLOAD_DIRECTORY;
    } else {
      process.env.UPLOAD_DIRECTORY = uploadDirectory;
    }
  });

  // processMedia is private
  const media = (path: string) =>
    (new TelegramProvider() as any).processMedia([{ type: 'image', path }]);

  it('refuses a local file outside the upload directory', () => {
    expect(() => media('/etc/passwd')).toThrow(BadBody);
  });

  it('hands over a file inside it', () => {
    expect(media(join(uploads, 'a.png'))[0].media).toBe(join(uploads, 'a.png'));
  });

  it('hands over a URL as it is', () => {
    expect(media('https://media.example/a.png')[0].media).toBe(
      'https://media.example/a.png'
    );
  });
});
