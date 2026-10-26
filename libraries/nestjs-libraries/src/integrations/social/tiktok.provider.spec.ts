// The creator posting profile TikTok requires the composer to read before it
// renders the Post to TikTok page (feature 012-tiktok-ux-compliance, User
// Story 2). Shape is fixed by contracts/creator-posting-profile.md — the
// composer builds its visibility list from it, so the field names are a
// contract rather than an implementation detail.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TiktokProvider } from './tiktok.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';

// The `@gitroom/react/*` alias is not mapped in this Jest config, so the
// locale JSON is read from disk the way the suite's other locale specs do.
const LOCALES_DIR = path.join(
  __dirname,
  '../../../../react-shared-libraries/src/translation/locales'
);
const en = JSON.parse(
  fs.readFileSync(path.join(LOCALES_DIR, 'en', 'translation.json'), 'utf8')
) as Record<string, string>;

const CREATOR_INFO_URL =
  'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

const response = (body: any, status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const profilePayload = {
  data: {
    creator_avatar_url: 'https://cdn.tiktok/avatar.jpg',
    creator_username: 'sharek_test',
    creator_nickname: 'Sharek Test',
    privacy_level_options: [
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'SELF_ONLY',
    ],
    comment_disabled: false,
    duet_disabled: true,
    stitch_disabled: true,
    max_video_post_duration_sec: 600,
  },
  error: { code: 'ok', message: '', log_id: 'log-1' },
};

let provider: TiktokProvider;
let fetchMock: jest.Mock;

beforeEach(() => {
  provider = new TiktokProvider();
  fetchMock = jest.fn().mockResolvedValue(response(profilePayload));
  (global as any).fetch = fetchMock;
});

describe('TiktokProvider.creatorInfo', () => {
  it('asks TikTok for the profile with the account token', async () => {
    await provider.creatorInfo('token-123');

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(CREATOR_INFO_URL);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer token-123');
  });

  it('reports the nickname and username of the account being posted to', async () => {
    const profile = await provider.creatorInfo('token-123');

    expect(profile.creatorNickname).toBe('Sharek Test');
    expect(profile.creatorUsername).toBe('sharek_test');
  });

  it('passes through exactly the visibility options TikTok allows, unsupplemented', async () => {
    const profile = await provider.creatorInfo('token-123');

    // Public and private accounts get different subsets; the product renders
    // whatever arrives and never adds to it.
    expect(profile.privacyLevelOptions).toEqual([
      'PUBLIC_TO_EVERYONE',
      'MUTUAL_FOLLOW_FRIENDS',
      'SELF_ONLY',
    ]);
  });

  it('reports which interactions the creator has disabled', async () => {
    const profile = await provider.creatorInfo('token-123');

    expect(profile.commentDisabled).toBe(false);
    expect(profile.duetDisabled).toBe(true);
    expect(profile.stitchDisabled).toBe(true);
  });

  it('reports the longest video the account may publish', async () => {
    const profile = await provider.creatorInfo('token-123');

    expect(profile.maxVideoPostDurationSec).toBe(600);
  });

  it('reports no error code when the account can publish', async () => {
    const profile = await provider.creatorInfo('token-123');

    expect(profile.errorCode).toBeNull();
  });
});

describe('TiktokProvider.creatorInfo — refusals', () => {
  // TikTok reports "this account cannot publish" with HTTP 200 and an error
  // code, not an error status.
  const refusal = (code: string) => ({
    data: {},
    error: { code, message: 'refused', log_id: 'log-2' },
  });

  it.each([
    'spam_risk_too_many_posts',
    'spam_risk_user_banned_from_posting',
    'reached_active_user_cap',
    'a_code_tiktok_has_not_documented_yet',
  ])('passes %s through untranslated for the interface to map', async (code) => {
    fetchMock.mockResolvedValue(response(refusal(code)));

    const profile = await provider.creatorInfo('token-123');

    expect(profile.errorCode).toBe(code);
  });

  it('reports the refusal even though the HTTP status is 200', async () => {
    fetchMock.mockResolvedValue(
      response(refusal('spam_risk_too_many_posts'), 200)
    );

    const profile = await provider.creatorInfo('token-123');

    expect(profile.errorCode).toBe('spam_risk_too_many_posts');
  });

  it('survives a refusal that carries no profile data at all', async () => {
    fetchMock.mockResolvedValue(
      response({ error: { code: 'reached_active_user_cap' } })
    );

    const profile = await provider.creatorInfo('token-123');

    expect(profile.errorCode).toBe('reached_active_user_cap');
    expect(profile.privacyLevelOptions).toEqual([]);
    expect(profile.maxVideoPostDurationSec).toBe(0);
  });
});

describe('TiktokProvider — pre-flight and publish-time wording agree (FR-014)', () => {
  // The enforceable half of FR-014: whatever the creator is told before
  // posting must be word-for-word what they would be told if the same
  // condition failed at publish time. The interface reads the English default
  // from these keys, so pinning them here is what stops the two drifting.
  const mapped: Array<[string, string]> = [
    ['spam_risk_too_many_posts', 'tiktok_refusal_daily_post_limit'],
    ['spam_risk_user_banned_from_posting', 'tiktok_refusal_account_banned'],
    ['reached_active_user_cap', 'tiktok_refusal_app_quota'],
  ];

  it.each(mapped)(
    'says the same thing before and after posting for %s',
    (code, key) => {
      const atPublishTime = provider.handleErrors(
        JSON.stringify({ error: { code } })
      );

      expect(atPublishTime?.value).toBeTruthy();
      expect(en[key]).toBe(atPublishTime!.value);
    }
  );

  it('names Sharek as the owner of the exhausted quota, not the creator', () => {
    // "Daily active user quota reached" reads as the creator's problem. The
    // quota is Sharek's, and the creator can do nothing about it but wait.
    const atPublishTime = provider.handleErrors(
      JSON.stringify({ error: { code: 'reached_active_user_cap' } })
    );

    expect(atPublishTime?.value).toContain('Sharek');
  });

  it('offers a generic fallback for a refusal it does not recognise', () => {
    expect(typeof en.tiktok_refusal_generic).toBe('string');
    expect(en.tiktok_refusal_generic.length).toBeGreaterThan(0);
  });
});

describe('TiktokProvider.maxVideoLength', () => {
  it('answers from the same profile call rather than querying twice', async () => {
    const result = await provider.maxVideoLength('token-123');

    expect(result).toEqual({ maxDurationSeconds: 600 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// TikTok's publish-status answer. The post id is an int64, so the provider
// reads it from the raw text; the helper keeps the digits exact.
const statusText = (status: string, publicId?: string) =>
  `{"data":{"status":"${status}"${
    publicId ? `,"publicaly_available_post_id":[${publicId}]` : ''
  }},"error":{"code":"ok","message":"","log_id":"log-3"}}`;

const textResponse = (text: string) => ({
  status: 200,
  ok: true,
  text: async () => text,
  json: async () => JSON.parse(text),
});

const channel = {
  id: 'int-1',
  internalId: 'open-id-1',
  profile: 'sharek.cafe',
} as unknown as Integration;

const INBOX = 'https://www.tiktok.com/messages?lang=en';

describe('TiktokProvider.checkPostStatus, the link stored at publish time', () => {
  // The draft keeps the 'missing' marker the API, the CLI and the calendar
  // read; its publish id rides after # so Open Post can ask TikTok later. The
  // fragment never reaches TikTok and the link still opens the inbox.
  it('stores an inbox draft as missing, with its publish id after # in the inbox link', async () => {
    fetchMock.mockResolvedValue(textResponse(statusText('SEND_TO_USER_INBOX')));

    await expect(
      provider.checkPostStatus(
        'token-123',
        { publishId: 'v_inbox_file~v2.123' },
        channel
      )
    ).resolves.toEqual({
      status: 'completed',
      postId: 'missing',
      releaseURL: `${INBOX}#v_inbox_file~v2.123`,
    });
  });

  it.each([
    ['p_pub_url~v2.9', 'photo'],
    ['v_pub_file~v2.9', 'video'],
  ])('links a published %s post under /%s/', async (publishId, kind) => {
    fetchMock.mockResolvedValue(
      textResponse(statusText('PUBLISH_COMPLETE', '7444444444444444444'))
    );

    await expect(
      provider.checkPostStatus('token-123', { publishId }, channel)
    ).resolves.toEqual({
      status: 'completed',
      postId: '7444444444444444444',
      releaseURL: `https://www.tiktok.com/@sharek.cafe/${kind}/7444444444444444444`,
    });
  });
});

describe('TiktokProvider.resolveReleaseId, Open Post', () => {
  it('asks TikTok about an inbox draft by the publish id kept in its link', async () => {
    fetchMock.mockResolvedValue(
      textResponse(statusText('PUBLISH_COMPLETE', '7123'))
    );

    await expect(
      provider.resolveReleaseId(
        'token-123',
        'missing',
        channel,
        {},
        `${INBOX}#v_inbox_file~v2.123`
      )
    ).resolves.toEqual({
      postId: '7123',
      releaseURL: 'https://www.tiktok.com/@sharek.cafe/video/7123',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      publish_id: 'v_inbox_file~v2.123',
    });
  });

  it('keeps an inbox draft on the inbox while TikTok has no public post for it', async () => {
    fetchMock.mockResolvedValue(textResponse(statusText('SEND_TO_USER_INBOX')));

    await expect(
      provider.resolveReleaseId(
        'token-123',
        'missing',
        channel,
        {},
        `${INBOX}#v_inbox_file~v2.123`
      )
    ).resolves.toBeUndefined();
  });

  // Drafts stored before the publish id was kept carry no fragment: they
  // keep opening the inbox, and TikTok is not asked.
  it('leaves a draft link stored without a publish id alone', async () => {
    await expect(
      provider.resolveReleaseId('token-123', 'missing', channel, {}, INBOX)
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['SELF_ONLY', 'MUTUAL_FOLLOW_FRIENDS'])(
    'says a %s post will never have a public link, without asking TikTok',
    async (privacy_level) => {
      await expect(
        provider.resolveReleaseId(
          'token-123',
          'v_pub_file~v2.9',
          channel,
          { privacy_level },
          'https://www.tiktok.com/@sharek.cafe'
        )
      ).resolves.toEqual({ unavailable: true });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('reports a public post TikTok has not released yet as pending', async () => {
    fetchMock.mockResolvedValue(textResponse(statusText('PUBLISH_COMPLETE')));

    await expect(
      provider.resolveReleaseId(
        'token-123',
        'v_pub_file~v2.9',
        channel,
        { privacy_level: 'PUBLIC_TO_EVERYONE' },
        'https://www.tiktok.com/@sharek.cafe'
      )
    ).resolves.toEqual({ pending: true });
  });
});

describe('TiktokProvider.releaseUrl, a post connected by hand', () => {
  // share_url carries tracking parameters, Sharek's client key among them,
  // and the stored link reaches the public API and webhooks.
  it('stores the share link without its query', async () => {
    fetchMock.mockResolvedValue(
      response({
        data: {
          videos: [
            {
              id: '7123',
              share_url:
                'https://www.tiktok.com/@sharek.cafe/video/7123?utm_campaign=tt4d_open_api&utm_source=awclientkey',
            },
          ],
        },
      })
    );

    await expect(provider.releaseUrl('token-123', '7123')).resolves.toBe(
      'https://www.tiktok.com/@sharek.cafe/video/7123'
    );
  });
});

// A video that is not a URL is read from the worker's disk for the upload, and
// the stored path is user-influenced, so only a file of the upload directory
// may be opened.
describe('TiktokProvider, a video stored on disk', () => {
  const uploadDirectory = process.env.UPLOAD_DIRECTORY;
  let uploads: string;

  beforeAll(() => {
    uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'sharek-tiktok-'));
    fs.writeFileSync(path.join(uploads, 'video.mp4'), 'video');
    process.env.UPLOAD_DIRECTORY = uploads;
  });

  afterAll(() => {
    fs.rmSync(uploads, { recursive: true, force: true });
    if (uploadDirectory === undefined) {
      delete process.env.UPLOAD_DIRECTORY;
    } else {
      process.env.UPLOAD_DIRECTORY = uploadDirectory;
    }
  });

  // the chunk reader is private
  const chunk = (file: string) =>
    (provider as any).tiktokChunkStream(file, 0, 2);

  it('refuses a file outside the upload directory', async () => {
    await expect(chunk('/etc/passwd')).rejects.toBeInstanceOf(BadBody);
  });

  it('reads a chunk of a file inside it', async () => {
    const read: Buffer[] = [];
    for await (const part of await chunk(path.join(uploads, 'video.mp4'))) {
      read.push(part as Buffer);
    }

    expect(Buffer.concat(read).toString()).toBe('vid');
  });
});
