import { S3Client } from '@aws-sdk/client-s3';
import { CloudflareStorage } from './cloudflare.storage';

// A Media library tile loads a small copy that the bucket zone's Image and
// Media Transformations make, only while CLOUDFLARE_TILE_IMAGES is "true" and
// only for a file under the bucket's origin; anything else loads the file
// itself. The switch is read when the storage is built.
describe('CloudflareStorage.tileImage', () => {
  const tileImages = process.env.CLOUDFLARE_TILE_IMAGES;
  const image = 'https://media.example.app/a1b2c3.png';
  const video = 'https://media.example.app/a1b2c3.mp4';

  const setSwitch = (value: string | undefined) => {
    if (value === undefined) {
      delete process.env.CLOUDFLARE_TILE_IMAGES;
    } else {
      process.env.CLOUDFLARE_TILE_IMAGES = value;
    }
  };

  const build = (bucketUrl = 'https://media.example.app/') =>
    new CloudflareStorage('acct', 'key', 'secret', 'auto', 'bucket', bucketUrl);

  afterEach(() => {
    setSwitch(tileImages);
    jest.restoreAllMocks();
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['"false"', 'false'],
    ['"1"', '1'],
    ['"TRUE"', 'TRUE'],
  ])(
    'answers the path for both kinds while the switch is %s',
    (_label, value) => {
      setSwitch(value);
      const storage = build();

      expect(storage.tileImage(image, 'image')).toBe(image);
      expect(storage.tileImage(video, 'video')).toBe(video);
    }
  );

  describe('while the switch is "true"', () => {
    beforeEach(() => {
      setSwitch('true');
    });

    it('answers a scaled-down copy for an image under the bucket origin', () => {
      expect(build().tileImage(image, 'image')).toBe(
        'https://media.example.app/cdn-cgi/image/width=384,height=384,fit=scale-down,format=auto,onerror=redirect/https://media.example.app/a1b2c3.png'
      );
    });

    it('answers the opening frame for a video under the bucket origin', () => {
      expect(build().tileImage(video, 'video')).toBe(
        'https://media.example.app/cdn-cgi/media/mode=frame,time=0s,width=384,height=384,fit=scale-down,format=jpg/https://media.example.app/a1b2c3.mp4'
      );
    });

    it('fits every file, of either kind, in the one 384 by 384 box', () => {
      const storage = build();
      const answers = [
        storage.tileImage('https://media.example.app/tall.jpg', 'image'),
        storage.tileImage('https://media.example.app/wide.webp', 'image'),
        storage.tileImage('https://media.example.app/story.mp4', 'video'),
        storage.tileImage('https://media.example.app/reel.mp4', 'video'),
      ];

      expect(
        answers.map((answer) =>
          answer.match(/width=\d+,height=\d+,fit=[a-z-]+/g)
        )
      ).toEqual(Array(4).fill(['width=384,height=384,fit=scale-down']));
    });

    it.each([
      ['a query string', 'https://media.example.app/a1b2c3.png?v=2'],
      ['an escaped space', 'https://media.example.app/my%20photo.png'],
    ])('keeps the stored address whole, with %s', (_label, path) => {
      expect(build().tileImage(path, 'image')).toBe(
        `https://media.example.app/cdn-cgi/image/width=384,height=384,fit=scale-down,format=auto,onerror=redirect/${path}`
      );
    });

    it.each([
      ['on another origin', 'https://other.example/a.png'],
      [
        'on an origin that starts like the bucket',
        'https://media.example.app.evil.test/a.png',
      ],
      ['given as a relative path', '/uploads/a.png'],
      ['with an empty path', ''],
    ])('answers the path for both kinds of a file %s', (_label, path) => {
      const storage = build();

      expect(storage.tileImage(path, 'image')).toBe(path);
      expect(storage.tileImage(path, 'video')).toBe(path);
    });

    it.each([
      ['without a scheme', 'media.example.app'],
      ['that is empty', ''],
    ])(
      'builds and answers the path from a bucket URL %s',
      (_label, bucketUrl) => {
        const storage = build(bucketUrl);

        expect(storage.tileImage(image, 'image')).toBe(image);
        expect(storage.tileImage(video, 'video')).toBe(video);
        expect(storage.tileImage(`${bucketUrl}/a.png`, 'image')).toBe(
          `${bucketUrl}/a.png`
        );
      }
    );
  });

  it('keeps the switch it was built with when it changes afterwards', () => {
    setSwitch('true');
    const on = build();
    setSwitch('false');
    const off = build();
    setSwitch('true');

    expect(off.tileImage(image, 'image')).toBe(image);
    setSwitch(undefined);
    expect(on.tileImage(image, 'image')).toBe(
      'https://media.example.app/cdn-cgi/image/width=384,height=384,fit=scale-down,format=auto,onerror=redirect/https://media.example.app/a1b2c3.png'
    );
  });

  it.each([
    ['on', 'true'],
    ['off', undefined],
  ])('sends nothing to storage while the switch is %s', (_label, value) => {
    const send = jest.spyOn(S3Client.prototype, 'send');
    setSwitch(value);
    const storage = build();

    storage.tileImage(image, 'image');
    storage.tileImage(video, 'video');

    expect(send).not.toHaveBeenCalled();
  });
});
