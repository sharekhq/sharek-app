// The controller's imports drag in the upload SDKs and Prisma; none of that
// code runs here, so the modules are swapped for empty shells (same pattern as
// media.service.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock('@gitroom/nestjs-libraries/upload/r2.uploader', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import {
  BadRequestException,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { MediaController } from './media.controller';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const org = { id: 'org-1' } as any;

const refusal = () =>
  new SubscriptionException({
    action: AuthorizationActions.Create,
    section: Sections.IMAGES_PER_MONTH,
  });

const makeController = (media: Record<string, any>) =>
  new MediaController(media as any);

// The Express response the streamed routes write to: it keeps the headers that
// were set, reads every written line back as a frame, and keeps the close
// listener so a test can play the client leaving.
const fakeResponse = () => {
  const res = {
    headers: {} as Record<string, string>,
    frames: [] as any[],
    ended: false,
    onClose: undefined as (() => void) | undefined,
    setHeader: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    write: jest.fn((chunk: string) => {
      res.frames.push(JSON.parse(chunk));
    }),
    flush: jest.fn(),
    end: jest.fn(() => {
      res.ended = true;
    }),
    on: jest.fn((event: string, listener: () => void) => {
      if (event === 'close') {
        res.onClose = listener;
      }
    }),
  };
  return res;
};

// Both routes used to answer 200 with a bare `false` when credits ran out, so
// the browser's global 402 handler never saw a refusal and the image modal had
// to invent its own message. The refusal now leaves the controller as itself.
describe('generateImage', () => {
  it('propagates the refusal instead of answering false', async () => {
    const controller = makeController({
      generateImage: jest.fn().mockRejectedValue(refusal()),
    });

    await expect(
      controller.generateImage(org, {} as any, 'a pomegranate')
    ).rejects.toBeInstanceOf(SubscriptionException);
  });

  it('still throws anything that is not a refusal', async () => {
    const controller = makeController({
      generateImage: jest
        .fn()
        .mockRejectedValue(new HttpException('the renderer fell over', 500)),
    });

    const err = await controller
      .generateImage(org, {} as any, 'a pomegranate')
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(500);
  });

  it('still answers a generated image', async () => {
    const controller = makeController({
      generateImage: jest.fn().mockResolvedValue('BASE64'),
    });

    await expect(
      controller.generateImage(org, {} as any, 'a pomegranate')
    ).resolves.toEqual({ output: 'data:image/png;base64,BASE64' });
  });
});

// The AI image window's two render routes: a generation, and an edit of the
// version on screen. A render can outlive both proxies' idle cuts, so each
// streams NDJSON with heartbeats as the video routes do. Everything that can be
// refused is refused before the first byte, while a status can still be sent
// (FR-024 – FR-027).
describe.each([
  {
    route: 'generateImageFromText',
    preflight: 'resolveImageWithPrompt',
    generator: 'generateImageWithPrompt',
    body: { prompt: 'a pomegranate', aspectRatio: 'square' },
  },
  {
    route: 'editImage',
    preflight: 'resolveImageEdit',
    generator: 'editImageWithPrompt',
    body: {
      imageId: '00000000-0000-4000-8000-000000000001',
      prompt: 'make the background plain white',
      aspectRatio: 'square',
    },
  },
] as const)('$route', ({ route, preflight, generator, body }) => {
  const prepared = { size: '1024x1024' };
  const media = { id: 'media-1', path: 'https://media/abc.jpg' };

  // The render as the service hands it over: the frames it yields, then the
  // failure it ends on, if any.
  const render = (frames: object[], failure?: unknown) =>
    jest.fn(async function* () {
      yield* frames;
      if (failure) {
        throw failure;
      }
    });

  // The route under test, on a controller whose service has these doubles.
  const handle = (
    service: Record<string, any>,
    res: ReturnType<typeof fakeResponse>
  ) => makeController(service)[route](org, body as any, res as any);

  it('refuses before the stream opens, as a real status', async () => {
    const rendering = render([{ name: 'done', media }]);
    const res = fakeResponse();

    await expect(
      handle(
        {
          [preflight]: jest.fn().mockRejectedValue(refusal()),
          [generator]: rendering,
        },
        res
      )
    ).rejects.toBeInstanceOf(SubscriptionException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.frames).toEqual([]);
    expect(rendering).not.toHaveBeenCalled();
  });

  it('streams the saved record as one unbuffered NDJSON line', async () => {
    const rendering = render([{ name: 'done', media }]);
    const res = fakeResponse();

    await handle(
      {
        [preflight]: jest.fn().mockResolvedValue(prepared),
        [generator]: rendering,
      },
      res
    );

    expect(res.headers).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    expect(rendering).toHaveBeenCalledWith(org, body, prepared);
    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(
      JSON.stringify({ name: 'done', media }) + '\n'
    );
    expect(res.ended).toBe(true);
  });

  describe('during a long render', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    // SC-004: three minutes, past nginx's 95 s and Cloudflare's ~100 s cuts.
    it('sends heartbeats until the image is ready', async () => {
      const res = fakeResponse();

      const handled = handle(
        {
          [preflight]: jest.fn().mockResolvedValue(prepared),
          [generator]: jest.fn(async function* () {
            await new Promise((resolve) => setTimeout(resolve, 180_000));
            yield { name: 'done', media };
          }),
        },
        res
      );
      await jest.advanceTimersByTimeAsync(180_000);
      await handled;

      const heartbeats = res.frames.filter(
        (frame) => frame.name === 'heartbeat'
      );
      expect(heartbeats.length).toBeGreaterThanOrEqual(8);
      expect(res.frames[res.frames.length - 1]).toEqual({
        name: 'done',
        media,
      });
    });
  });

  // The status line is already a 200 once the stream is open, so a failure has
  // to travel as the last frame.
  it.each([
    ['a failure written for the user', new HttpException('x', 422), 'x'],
    [
      'any other failure',
      new Error('socket hang up'),
      'Something went wrong while creating your image, please try again.',
    ],
  ])('ends with an error frame for %s', async (_case, failure, message) => {
    const res = fakeResponse();

    await handle(
      {
        [preflight]: jest.fn().mockResolvedValue(prepared),
        [generator]: render([], failure),
      },
      res
    );

    expect(res.frames[res.frames.length - 1]).toEqual({
      name: 'error',
      error: true,
      message,
    });
    expect(res.ended).toBe(true);
  });

  // The render cannot be cancelled once it is running; it finishes and saves
  // on its credit, but nothing is written to a client that has left.
  it('stops writing once the client has gone', async () => {
    const res = fakeResponse();

    await handle(
      {
        [preflight]: jest.fn().mockResolvedValue(prepared),
        [generator]: jest.fn(async function* () {
          res.onClose?.();
          yield { name: 'done', media };
        }),
      },
      res
    );

    expect(res.frames).toEqual([]);
    expect(res.ended).toBe(true);
  });
});

// The Transloadit uploader saves what it put in the bucket by the bare object
// name the upload returned, and the stored path is the bucket URL plus that
// name, so any other name would point the media outside the bucket.
// A video card's check, so it answers only what the card needs. The failure text
// stays out, because the card shows fixed words and a provider's raw message has no
// reason to reach the browser.
describe('getGenerateVideoStatus', () => {
  const JOB = 'video_org-1_abc';

  const answer = (status: unknown) => {
    const getGenerateVideoStatus = jest.fn().mockResolvedValue(status);
    const controller = makeController({ getGenerateVideoStatus });
    return {
      getGenerateVideoStatus,
      result: controller.getGenerateVideoStatus(org, JOB),
    };
  };

  it('asks the service for this organization’s job', async () => {
    const { getGenerateVideoStatus, result } = answer({ status: 'pending' });

    await result;

    expect(getGenerateVideoStatus).toHaveBeenCalledWith(org, JOB);
  });

  it('answers a render still going', async () => {
    expect(await answer({ status: 'pending' }).result).toEqual({
      status: 'pending',
    });
  });

  it('answers a finished video with its id and link', async () => {
    expect(
      await answer({
        status: 'completed',
        id: 'media-1',
        path: 'https://media/v.mp4',
      }).result
    ).toEqual({
      status: 'completed',
      id: 'media-1',
      path: 'https://media/v.mp4',
    });
  });

  it('answers a failed render with no failure text', async () => {
    const result = await answer({
      status: 'failed',
      error: 'kie.ai said: quota exceeded for key',
    }).result;

    expect(result).toEqual({ status: 'failed' });
    expect(result).not.toHaveProperty('error');
  });

  // Another organization's job, or one Temporal no longer holds.
  it('lets the service’s 404 through', async () => {
    const notFound = new HttpException('Video job not found', 404);
    const controller = makeController({
      getGenerateVideoStatus: jest.fn().mockRejectedValue(notFound),
    });

    await expect(
      controller.getGenerateVideoStatus(org, 'video_org-2_abc')
    ).rejects.toBe(notFound);
  });
});

describe('saveMedia', () => {
  const bucketUrl = process.env.CLOUDFLARE_BUCKET_URL;

  beforeEach(() => {
    process.env.CLOUDFLARE_BUCKET_URL = 'https://media.example';
  });

  afterEach(() => {
    if (bucketUrl === undefined) {
      delete process.env.CLOUDFLARE_BUCKET_URL;
    } else {
      process.env.CLOUDFLARE_BUCKET_URL = bucketUrl;
    }
  });

  it.each(['a/b.png', 'a\\b.png', '.', '..'])(
    'refuses the name %s',
    async (name) => {
      const saveFile = jest.fn();

      await expect(
        makeController({ saveFile }).saveMedia(org, {} as any, name, '')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(saveFile).not.toHaveBeenCalled();
    }
  );

  it('refuses any name while no bucket is configured', async () => {
    delete process.env.CLOUDFLARE_BUCKET_URL;
    const saveFile = jest.fn();

    await expect(
      makeController({ saveFile }).saveMedia(org, {} as any, 'a.png', '')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('saves a bare name under the bucket URL', async () => {
    const saveFile = jest.fn().mockResolvedValue({ id: 'media-1' });

    await expect(
      makeController({ saveFile }).saveMedia(
        org,
        {} as any,
        'a.png',
        'photo.png'
      )
    ).resolves.toEqual({ id: 'media-1' });
    expect(saveFile).toHaveBeenCalledWith(
      'org-1',
      'a.png',
      'https://media.example/a.png',
      'photo.png'
    );
  });
});

// The media library's list, its month counts and its bulk delete
// (contracts/media-api.md): the controller hands the service the organization
// and the validated query or body, and answers what the service answers, except
// the bulk delete, which answers nothing (Rule 12).
describe('the media library routes', () => {
  const month = { from: '2026-10-01T04:00:00Z', to: '2026-11-01T04:00:00Z' };

  it('getMedia hands the query to getLibraryPage and answers its page', async () => {
    const page = { pages: 7, results: [{ id: 'media-1' }] };
    const getLibraryPage = jest.fn().mockResolvedValue(page);
    const query = { page: 2, search: 'logo', type: 'video', sort: 'oldest' };

    await expect(
      makeController({ getLibraryPage }).getMedia(org, query as any)
    ).resolves.toBe(page);
    expect(getLibraryPage).toHaveBeenCalledWith('org-1', query);
  });

  it('getMonthCount hands the range to countMonth and answers its count', async () => {
    const countMonth = jest.fn().mockResolvedValue({ count: 23 });

    await expect(
      makeController({ countMonth }).getMonthCount(org, month as any)
    ).resolves.toEqual({ count: 23 });
    expect(countMonth).toHaveBeenCalledWith('org-1', month);
  });

  it('getMonthIds hands the range to monthIds and answers its ids', async () => {
    const monthIds = jest.fn().mockResolvedValue({ ids: ['media-1'] });

    await expect(
      makeController({ monthIds }).getMonthIds(org, month as any)
    ).resolves.toEqual({ ids: ['media-1'] });
    expect(monthIds).toHaveBeenCalledWith('org-1', month);
  });

  it('deleteManyMedia hands the ids to the service and answers nothing', async () => {
    const deleteManyMedia = jest.fn().mockResolvedValue({ count: 2 });

    await expect(
      makeController({ deleteManyMedia }).deleteManyMedia(org, {
        ids: ['media-1', 'media-2'],
      })
    ).resolves.toBeUndefined();
    expect(deleteManyMedia).toHaveBeenCalledWith('org-1', [
      'media-1',
      'media-2',
    ]);
  });

  // The client counts a failed batch's files as not deleted.
  it('deleteManyMedia waits for the service and lets its failure through', async () => {
    const failure = new HttpException('the database fell over', 500);
    const deleteManyMedia = jest.fn().mockRejectedValue(failure);

    await expect(
      makeController({ deleteManyMedia }).deleteManyMedia(org, {
        ids: ['media-1'],
      })
    ).rejects.toBe(failure);
  });
});

// Real routing and the global ValidationPipe, as main.ts sets it: the list's
// type and sort, a month's range and the bulk delete's ids are checked before
// the service, "month" is a route of its own rather than a file's id, and
// upstream's DELETE /media/:id still answers beside DELETE /media.
describe('the media library routes, through the router', () => {
  const media = {
    getLibraryPage: jest.fn(),
    countMonth: jest.fn(),
    monthIds: jest.fn(),
    getMediaStatus: jest.fn(),
    deleteManyMedia: jest.fn(),
    deleteMedia: jest.fn(),
  };
  const range = 'from=2026-10-01T04:00:00Z&to=2026-11-01T04:00:00Z';
  let app: INestApplication;
  let url: string;

  const send = (method: string, path: string, body?: object) =>
    fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: media }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: { org: unknown }, _res: unknown, next: () => void) => {
      req.org = { id: 'org-1' };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    media.getLibraryPage
      .mockReset()
      .mockResolvedValue({ pages: 0, results: [] });
    media.countMonth.mockReset().mockResolvedValue({ count: 23 });
    media.monthIds.mockReset().mockResolvedValue({ ids: ['media-1'] });
    media.getMediaStatus.mockReset().mockResolvedValue({ status: 'ready' });
    media.deleteManyMedia.mockReset().mockResolvedValue({ count: 2 });
    media.deleteMedia.mockReset().mockResolvedValue({ id: 'abc' });
  });

  it('GET /media hands getLibraryPage the page as a number, the type and the sort', async () => {
    const response = await send('GET', '/media?page=2&type=video&sort=oldest');

    expect(response.status).toBe(200);
    expect(media.getLibraryPage).toHaveBeenCalledWith('org-1', {
      page: 2,
      type: 'video',
      sort: 'oldest',
    });
  });

  it('GET /media refuses a type it does not know with a 400, before the service', async () => {
    const response = await send('GET', '/media?type=gif');

    expect(response.status).toBe(400);
    expect(media.getLibraryPage).not.toHaveBeenCalled();
  });

  it('GET /media/month answers countMonth’s count for the range', async () => {
    const response = await send('GET', `/media/month?${range}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 23 });
    expect(media.countMonth).toHaveBeenCalledWith('org-1', {
      from: '2026-10-01T04:00:00Z',
      to: '2026-11-01T04:00:00Z',
    });
  });

  it('GET /media/month/ids answers monthIds’ ids, not a file’s status', async () => {
    const response = await send('GET', `/media/month/ids?${range}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ids: ['media-1'] });
    expect(media.monthIds).toHaveBeenCalledWith('org-1', {
      from: '2026-10-01T04:00:00Z',
      to: '2026-11-01T04:00:00Z',
    });
    expect(media.getMediaStatus).not.toHaveBeenCalled();
  });

  it.each(['/media/month', '/media/month/ids'])(
    'GET %s refuses a from that is no date with a 400, before the service',
    async (path) => {
      const response = await send(
        'GET',
        `${path}?from=yesterday&to=2026-11-01T04:00:00Z`
      );

      expect(response.status).toBe(400);
      expect(media.countMonth).not.toHaveBeenCalled();
      expect(media.monthIds).not.toHaveBeenCalled();
    }
  );

  it('DELETE /media refuses 501 ids with a 400, before the service', async () => {
    const response = await send('DELETE', '/media', {
      ids: Array.from({ length: 501 }, (_, n) => `media-${n}`),
    });

    expect(response.status).toBe(400);
    expect(media.deleteManyMedia).not.toHaveBeenCalled();
  });

  it('DELETE /media hands deleteManyMedia the ids and answers an empty 200', async () => {
    const response = await send('DELETE', '/media', {
      ids: ['media-1', 'media-2'],
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('');
    expect(media.deleteManyMedia).toHaveBeenCalledWith('org-1', [
      'media-1',
      'media-2',
    ]);
    expect(media.deleteMedia).not.toHaveBeenCalled();
  });

  // Upstream's route, today's: a guard.
  it('DELETE /media/abc still reaches upstream’s deleteMedia', async () => {
    const response = await send('DELETE', '/media/abc');

    expect(response.status).toBe(200);
    expect(media.deleteMedia).toHaveBeenCalledWith('org-1', 'abc');
    expect(media.deleteManyMedia).not.toHaveBeenCalled();
  });
});
