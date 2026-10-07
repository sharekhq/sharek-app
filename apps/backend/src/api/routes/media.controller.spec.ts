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

import { HttpException } from '@nestjs/common';
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
