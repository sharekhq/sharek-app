import { YoutubeProvider } from './youtube.provider';
import { Integration } from '@prisma/client';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

describe('YoutubeProvider, a refresh failure', () => {
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
