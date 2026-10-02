// The controller builds a storage client at construction and its imports drag
// in the upload SDKs and Prisma; none of that code runs here, so the modules are
// swapped for empty shells (same pattern as media.service.spec).
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
    json: jest.fn(),
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

// The AI image window's route. Its render can outlive both proxies' idle cuts,
// so it streams NDJSON with heartbeats as the video routes do. Everything that
// can be refused is refused before the first byte, while a status can still be
// sent (FR-024 – FR-027).
describe('generateImageFromText', () => {
  const NDJSON = 'application/x-ndjson';
  const body = { prompt: 'a pomegranate', aspectRatio: 'square' } as any;
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

  it('refuses before the stream opens, as a real status', async () => {
    const generateImageWithPrompt = render([{ name: 'done', media }]);
    const controller = makeController({
      resolveImageWithPrompt: jest.fn().mockRejectedValue(refusal()),
      generateImageWithPrompt,
    });
    const res = fakeResponse();

    await expect(
      controller.generateImageFromText(org, body, NDJSON, res as any)
    ).rejects.toBeInstanceOf(SubscriptionException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.frames).toEqual([]);
    expect(generateImageWithPrompt).not.toHaveBeenCalled();
  });

  it('streams the saved record as one unbuffered NDJSON line', async () => {
    const generateImageWithPrompt = render([{ name: 'done', media }]);
    const controller = makeController({
      resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
      generateImageWithPrompt,
    });
    const res = fakeResponse();

    await controller.generateImageFromText(org, body, NDJSON, res as any);

    expect(res.headers).toEqual({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    expect(generateImageWithPrompt).toHaveBeenCalledWith(org, body, prepared);
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
      const controller = makeController({
        resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
        generateImageWithPrompt: jest.fn(async function* () {
          await new Promise((resolve) => setTimeout(resolve, 180_000));
          yield { name: 'done', media };
        }),
      });
      const res = fakeResponse();

      const handled = controller.generateImageFromText(
        org,
        body,
        NDJSON,
        res as any
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
    const controller = makeController({
      resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
      generateImageWithPrompt: render([], failure),
    });
    const res = fakeResponse();

    await controller.generateImageFromText(org, body, NDJSON, res as any);

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
    const controller = makeController({
      resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
      generateImageWithPrompt: jest.fn(async function* () {
        res.onClose?.();
        yield { name: 'done', media };
      }),
    });

    await controller.generateImageFromText(org, body, NDJSON, res as any);

    expect(res.frames).toEqual([]);
    expect(res.ended).toBe(true);
  });

  // A page loaded before the stream existed reads one JSON record, and would
  // read a stream as a failure that "was not charged". Until no such page can
  // be open, it gets the record it understands (research R3).
  describe('for a request that does not ask for the stream', () => {
    it('answers the saved record as plain JSON', async () => {
      const controller = makeController({
        resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
        generateImageWithPrompt: render([{ name: 'done', media }]),
      });
      const res = fakeResponse();

      await controller.generateImageFromText(
        org,
        body,
        'application/json',
        res as any
      );

      expect(res.json).toHaveBeenCalledWith(media);
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.frames).toEqual([]);
    });

    it('fails with the status of the failure', async () => {
      const controller = makeController({
        resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
        generateImageWithPrompt: render([], new HttpException('x', 422)),
      });
      const res = fakeResponse();

      const err = await controller
        .generateImageFromText(org, body, 'application/json', res as any)
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(res.json).not.toHaveBeenCalled();
      expect(res.frames).toEqual([]);
    });

    // The handler owns the response, so a render that ends without its record
    // must still be answered, or the page waits for the proxy to cut it.
    it('fails rather than leaving the request unanswered', async () => {
      const controller = makeController({
        resolveImageWithPrompt: jest.fn().mockResolvedValue(prepared),
        generateImageWithPrompt: render([]),
      });
      const res = fakeResponse();

      const err = await controller
        .generateImageFromText(org, body, 'application/json', res as any)
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(500);
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
