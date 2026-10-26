import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { YoutubeProvider } from './youtube.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

describe('YoutubeProvider, a Google Workspace session policy refusal', () => {
  // What Google answers a refresh when the Workspace reauthentication policy
  // invalidated the grant.
  const invalidRapt = {
    response: {
      data: {
        error: 'invalid_grant',
        error_subtype: 'invalid_rapt',
        error_description: 'reauth related error (invalid_rapt)',
      },
    },
  };

  // The text reaches the user in the bell and by email (informAboutRefreshError).
  it('tells the user to ask their Workspace admin to trust Sharek', () => {
    const message = new YoutubeProvider().refreshErrorMessage(invalidRapt);

    expect(message).toContain('mark Sharek as a trusted app');
    expect(message).not.toMatch(/postiz/i);
  });

  it('leaves any other refresh failure to the generic message', () => {
    expect(
      new YoutubeProvider().refreshErrorMessage({
        response: { data: { error: 'invalid_grant' } },
      })
    ).toBeUndefined();
  });
});

describe('YoutubeProvider.postPending, the thumbnail', () => {
  const pendingData = async (
    settings: Record<string, unknown>,
    media: Record<string, unknown>[]
  ) => {
    const provider = new YoutubeProvider();
    // the size probe and the session request are not under test
    jest
      .spyOn(
        provider as unknown as {
          youtubeMediaSize: (path: string) => Promise<number>;
        },
        'youtubeMediaSize'
      )
      .mockResolvedValue(1024);
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      headers: new Headers({ location: 'https://upload.example/session-1' }),
    } as unknown as Response);

    const [result] = await provider.postPending(
      'channel-1',
      'access-token',
      [
        {
          id: 'post-1',
          message: 'Hello',
          settings: {
            title: 'A video',
            type: 'public',
            selfDeclaredMadeForKids: 'no',
            ...settings,
          },
          media,
        } as unknown as PostDetails,
      ],
      {} as Integration
    );

    return result.pendingData as { thumbnail: string; postDbId: string };
  };

  const video = [
    {
      path: 'https://media.example/video.mp4',
      thumbnail: 'https://media.example/cover.jpg',
    },
  ];

  it('uses the YouTube thumbnail setting', async () => {
    const { thumbnail } = await pendingData(
      { thumbnail: { path: 'https://media.example/youtube.jpg' } },
      video
    );

    expect(thumbnail).toBe('https://media.example/youtube.jpg');
  });

  // The post settings' thumbnails panel is left out, so a cover chosen for the
  // media item does not become the YouTube thumbnail.
  it("never falls back to the media item's own cover", async () => {
    const { thumbnail } = await pendingData({}, video);

    expect(thumbnail).toBe('');
  });

  // A video that published but failed at the thumbnail step keeps its link.
  it('carries the post id the thumbnail step needs to keep the video link', async () => {
    const { postDbId } = await pendingData({}, video);

    expect(postDbId).toBe('post-1');
  });
});

// A video that is not a URL is sized and read from the worker's disk for the
// resumable upload, and the stored path is user-influenced, so only a file of
// the upload directory may be opened.
describe('YoutubeProvider, a video stored on disk', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  let uploads: string;

  beforeAll(() => {
    uploads = mkdtempSync(join(tmpdir(), 'sharek-youtube-'));
    writeFileSync(join(uploads, 'video.mp4'), 'video');
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

  // both readers are private
  const provider = new YoutubeProvider() as any;

  it('refuses to size a file outside the upload directory', async () => {
    await expect(provider.youtubeMediaSize('/etc/passwd')).rejects.toBeInstanceOf(
      BadBody
    );
  });

  it('refuses to read a file outside the upload directory', async () => {
    await expect(
      provider.youtubeChunkStream('/etc/passwd', 0, 2)
    ).rejects.toBeInstanceOf(BadBody);
  });

  it('sizes and reads a file inside it', async () => {
    const video = join(uploads, 'video.mp4');
    const read: Buffer[] = [];
    for await (const part of await provider.youtubeChunkStream(video, 0, 2)) {
      read.push(part as Buffer);
    }

    await expect(provider.youtubeMediaSize(video)).resolves.toBe(5);
    expect(Buffer.concat(read).toString()).toBe('vid');
  });
});
