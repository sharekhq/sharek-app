// MediaService builds a storage client at construction and its constructor
// deps drag in Prisma and provider SDKs; none of that code runs here, so the
// modules are swapped for empty shells (same pattern as load.tools.service.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.repository',
  () => ({ MediaRepository: class {} })
);
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/videos/video.manager', () => ({
  VideoManager: class {},
}));
// A reference's bytes come from storage; each test says what the stored file
// holds, and the error class stays a class so the service can tell it apart.
jest.mock('@gitroom/helpers/utils/read.or.fetch', () => ({
  readOrFetch: jest.fn(),
  MediaTooLargeError: class MediaTooLargeError extends Error {},
}));

import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import { MediaService } from './media.service';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  MediaTooLargeError,
  readOrFetch,
} from '@gitroom/helpers/utils/read.or.fetch';
import { IMAGE_REFERENCE_MAX } from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

const org = { id: 'org-1', isTrailing: false } as any;
const body = () =>
  ({ type: 'veo3', output: 'vertical', customParams: { prompt: 'p' } } as any);

const oneShotVideo = () => ({
  trial: true,
  instance: {
    processAndValidate: jest.fn().mockResolvedValue(undefined),
    process: jest.fn().mockResolvedValue('https://provider/raw.mp4'),
  },
});

const openAi = () => ({
  generateImage: jest.fn().mockResolvedValue('LEGACYB64'),
  generatePromptForPicture: jest.fn().mockResolvedValue('an enhanced scene'),
  generateImageAtSize: jest.fn().mockResolvedValue(Buffer.from('JPEG-BYTES')),
  editImageAtSize: jest.fn().mockResolvedValue(Buffer.from('EDIT-BYTES')),
  rewriteFlaggedPrompt: jest.fn().mockResolvedValue('an anonymous scene'),
});

const dto = (over: Partial<Record<string, any>> = {}) =>
  ({ prompt: 'قهوة مختصة في الرياض', aspectRatio: 'square', ...over } as any);

// The real checkCredits returns the far end of the window it counted usage
// over alongside the balance; a refusal quotes it.
const RESETS_AT = '2026-09-12T08:31:04.000Z';

const makeService = (
  over: {
    credits?: number;
    video?: any;
    openAi?: any;
    spendCredit?: boolean;
    temporal?: any;
    // Where the upload lands and so what the saved record points at; the real
    // storage names the file after the type it detects in the bytes.
    file?: string;
    // The Media rows the organization's library answers with for a reference
    // lookup, in the order the database returns them.
    references?: Array<{ id: string; path: string }>;
  } = {}
) => {
  // The real useCredit commits the credit only when its callback resolves and
  // refunds when it throws, so `charged` is what "no charge on failure" means.
  const charged = { value: false };
  const subscription = {
    checkCredits: jest
      .fn()
      .mockResolvedValue({ credits: over.credits ?? 1, resetsAt: RESETS_AT }),
    useCredit: jest.fn((_org: any, _type: any, func: () => any) =>
      over.spendCredit === false
        ? undefined
        : Promise.resolve(func()).then((result) => {
            charged.value = true;
            return result;
          })
    ),
  };
  const manager = { getVideoByName: jest.fn().mockReturnValue(over.video) };
  const repository = {
    getMediaByIds: jest.fn().mockResolvedValue(over.references ?? []),
  };
  const service = new MediaService(
    repository as any,
    over.openAi ?? ({} as any),
    subscription as any,
    manager as any,
    over.temporal as any
  );
  const file = over.file ?? 'https://media/abc.mp4';
  (service as any).storage = {
    uploadSimple: jest.fn().mockResolvedValue(file),
  };
  const saveFile = jest
    .spyOn(service, 'saveFile')
    .mockResolvedValue({ id: 'media-1', path: file } as any);
  return { service, subscription, saveFile, charged, repository };
};

const read = readOrFetch as jest.Mock;

beforeEach(() => {
  read.mockReset();
});

const drain = async (gen: AsyncGenerator<any>) => {
  const frames = [];
  for await (const frame of gen) frames.push(frame);
  return frames;
};

// The image route's two steps, as the controller runs them: the pre-flight,
// then the render it prepared.
const generateWithPrompt = async (service: MediaService, request = dto()) =>
  drain(
    service.generateImageWithPrompt(
      org,
      request,
      await service.resolveImageWithPrompt(org, request)
    )
  );

describe('resolveVideo', () => {
  it('throws SubscriptionException when no credits remain', async () => {
    const { service } = makeService({ credits: 0, video: oneShotVideo() });
    await expect(service.resolveVideo(org, body())).rejects.toBeInstanceOf(
      SubscriptionException
    );
  });

  it('throws 404 for an unknown video type', async () => {
    const { service } = makeService({ video: undefined });
    const err = await service.resolveVideo(org, body()).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
  });

  it('refuses a non-trial video for a trialing org', async () => {
    const { service } = makeService({
      video: { ...oneShotVideo(), trial: false },
    });
    const err = await service
      .resolveVideo({ ...org, isTrailing: true }, body())
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(406);
  });

  it('validates params and returns the resolved video', async () => {
    const video = oneShotVideo();
    const { service } = makeService({ video });
    await expect(service.resolveVideo(org, body())).resolves.toBe(video);
    expect(video.instance.processAndValidate).toHaveBeenCalledWith(
      body().customParams
    );
  });
});

// The pre-flight the modal calls before it shows a waiting screen. It has to
// refuse everything the render would refuse, or the UI commits to a render that
// is about to be turned away — and the client's billing dialog stops the
// request dead, so the refusal never gets back to the screen.
describe('generateVideoAllowed', () => {
  it('throws SubscriptionException when no credits remain', async () => {
    const { service } = makeService({ credits: 0, video: oneShotVideo() });
    await expect(
      service.generateVideoAllowed(org, 'veo3')
    ).rejects.toBeInstanceOf(SubscriptionException);
  });

  it('refuses a non-trial video for a trialing org', async () => {
    const { service } = makeService({
      video: { ...oneShotVideo(), trial: false },
    });
    const err = await service
      .generateVideoAllowed({ ...org, isTrailing: true }, 'veo3')
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(406);
  });

  // The trial refusal is the status this endpoint already returned, and the
  // finish-trial dialog keys off it. Adding the credit check must not move it.
  it('keeps the trial refusal ahead of the credit one', async () => {
    const { service } = makeService({
      credits: 0,
      video: { ...oneShotVideo(), trial: false },
    });
    const err = await service
      .generateVideoAllowed({ ...org, isTrailing: true }, 'veo3')
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(406);
  });

  it('rejects an unknown video type', async () => {
    const { service } = makeService({ video: undefined });
    await expect(service.generateVideoAllowed(org, 'nope')).rejects.toThrow();
  });

  it('allows a render when credits remain', async () => {
    const { service } = makeService({ video: oneShotVideo() });
    await expect(service.generateVideoAllowed(org, 'veo3')).resolves.toBe(true);
  });
});

// Images had no pre-flight, so the modal entered its generating phase and only
// then met the refusal — a loader that flashes for half a second before the
// limit card. Videos ask first; this is the same question for images.
describe('generateImageAllowed', () => {
  // resolveImage short-circuits without a Stripe key (the self-hosted
  // carve-out), and the runner has none — so enforcement has to be switched on
  // deliberately or every case below would pass for the wrong reason.
  const previousKey = process.env.STRIPE_PUBLISHABLE_KEY;
  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
  });
  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = previousKey;
    }
  });

  it('throws SubscriptionException when no credits remain', async () => {
    const { service } = makeService({ credits: 0 });
    await expect(service.generateImageAllowed(org)).rejects.toBeInstanceOf(
      SubscriptionException
    );
  });

  // The pre-flight must carry everything the render's refusal carries, or the
  // card it raises would be missing its reset date.
  it('quotes the same reset date the refusal carries', async () => {
    const { service } = makeService({ credits: 0 });
    const err = await service.generateImageAllowed(org).catch((e) => e);
    expect(err.getResponse()).toMatchObject({
      section: 'images_per_month',
      resetsAt: RESETS_AT,
    });
  });

  it('allows a generation when credits remain', async () => {
    const { service } = makeService({ credits: 3 });
    await expect(service.generateImageAllowed(org)).resolves.toBe(true);
  });

  // The same carve-out resolveImage already makes: a self-hosted install has no
  // Stripe key, reads as tier FREE, and would otherwise refuse every image.
  it('allows everything when billing is switched off', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const { service, subscription } = makeService({ credits: 0 });

    await expect(service.generateImageAllowed(org)).resolves.toBe(true);
    expect(subscription.checkCredits).not.toHaveBeenCalled();
  });

  // It asks, it does not spend: the credit belongs to the generation.
  it('spends nothing', async () => {
    const { service, subscription, charged } = makeService({ credits: 3 });
    await service.generateImageAllowed(org);
    expect(subscription.useCredit).not.toHaveBeenCalled();
    expect(charged.value).toBe(false);
  });
});

describe('processVideo', () => {
  it('renders, uploads, saves and yields a single done frame', async () => {
    const video = oneShotVideo();
    const { service, subscription, saveFile } = makeService({ video });

    const frames = await drain(service.processVideo(org, body(), video as any));

    expect(frames).toEqual([
      { name: 'done', media: { id: 'media-1', path: 'https://media/abc.mp4' } },
    ]);
    expect(subscription.useCredit).toHaveBeenCalledWith(
      org,
      'ai_videos',
      expect.any(Function)
    );
    expect(video.instance.process).toHaveBeenCalledWith(
      'vertical',
      body().customParams
    );
    expect((service as any).storage.uploadSimple).toHaveBeenCalledWith(
      'https://provider/raw.mp4'
    );
    expect(saveFile).toHaveBeenCalledWith(
      'org-1',
      'abc.mp4',
      'https://media/abc.mp4'
    );
  });

  it('normalises provider failures through generationError', async () => {
    const video = oneShotVideo();
    video.instance.process = jest
      .fn()
      .mockRejectedValue(new Error('rejected by the safety system'));
    const { service } = makeService({ video });

    const err = await drain(
      service.processVideo(org, body(), video as any)
    ).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(422);
  });
});

describe('generateVideo (public API + chat tool path)', () => {
  it('still resolves to the saved media', async () => {
    const { service } = makeService({ video: oneShotVideo() });
    await expect(service.generateVideo(org, body())).resolves.toEqual({
      id: 'media-1',
      path: 'https://media/abc.mp4',
    });
  });

  it('propagates pre-check failures unchanged', async () => {
    const { service } = makeService({ credits: 0, video: oneShotVideo() });
    await expect(service.generateVideo(org, body())).rejects.toBeInstanceOf(
      SubscriptionException
    );
  });
});

// A render takes minutes, which is longer than an assistant turn can stay
// open, so the agent path starts a Temporal job and answers with its id. The
// pre-flight still runs first: a refusal has to reach the user as a refusal,
// not as a job that fails minutes later on a credit it never had.
describe('startGenerateVideo', () => {
  const temporal = () => {
    const start = jest.fn().mockResolvedValue(undefined);
    const getWorkflowHandle = jest.fn();
    return {
      start,
      getWorkflowHandle,
      client: {
        getRawClient: () => ({ workflow: { start } }),
        getWorkflowHandle,
      },
    };
  };

  it('refuses before a job exists when no credits remain', async () => {
    const t = temporal();
    const { service } = makeService({
      credits: 0,
      video: oneShotVideo(),
      temporal: t,
    });

    const err = await service.startGenerateVideo(org, body()).catch((e) => e);
    expect(err).toBeInstanceOf(SubscriptionException);
    expect(err.getStatus()).toBe(402);
    expect(t.start).not.toHaveBeenCalled();
  });

  it('starts the workflow under an id owned by the organization', async () => {
    const t = temporal();
    const { service } = makeService({ video: oneShotVideo(), temporal: t });

    const result = await service.startGenerateVideo(org, body());

    expect(t.start).toHaveBeenCalledTimes(1);
    const [name, options] = t.start.mock.calls[0];
    expect(name).toBe('generateVideoWorkflow');
    expect(options.workflowId).toMatch(
      new RegExp(`^video_${org.id}_[A-Za-z0-9]{10}$`)
    );
    expect(options.taskQueue).toBe('main');
    expect(options.args[0]).toEqual({ organizationId: org.id, body: body() });
    expect(result).toEqual({ jobId: options.workflowId });
  });
});

describe('getGenerateVideoStatus', () => {
  const temporal = (handle?: any) => {
    const getWorkflowHandle = jest.fn().mockResolvedValue(handle);
    return { getWorkflowHandle, client: { getWorkflowHandle } };
  };

  it('will not look up a job belonging to another workspace', async () => {
    const t = temporal();
    const { service } = makeService({ temporal: t });

    const err = await service
      .getGenerateVideoStatus(org, 'video_someone-else_abcdefghij')
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
    expect(t.getWorkflowHandle).not.toHaveBeenCalled();
  });

  it('reports running, saved and failed jobs', async () => {
    const jobId = `video_${org.id}_abcdefghij`;

    const running = {
      describe: jest.fn().mockResolvedValue({ status: { name: 'RUNNING' } }),
      result: jest.fn(),
    };
    const { service: pending } = makeService({ temporal: temporal(running) });
    await expect(pending.getGenerateVideoStatus(org, jobId)).resolves.toEqual({
      status: 'pending',
    });

    const done = {
      describe: jest.fn().mockResolvedValue({ status: { name: 'COMPLETED' } }),
      result: jest.fn().mockResolvedValue({ id: 'm1', path: '/x.mp4' }),
    };
    const { service: completed } = makeService({ temporal: temporal(done) });
    await expect(completed.getGenerateVideoStatus(org, jobId)).resolves.toEqual({
      status: 'completed',
      id: 'm1',
      path: '/x.mp4',
    });

    // Only the innermost message survives a workflow failure, so that is the
    // sentence the user is shown.
    const broken = {
      describe: jest.fn().mockResolvedValue({ status: { name: 'FAILED' } }),
      result: jest.fn().mockRejectedValue({
        message: 'Workflow failed',
        cause: {
          message: 'Activity failed',
          cause: {
            message: 'No AI video credits are available on this account.',
          },
        },
      }),
    };
    const { service: failed } = makeService({ temporal: temporal(broken) });
    await expect(failed.getGenerateVideoStatus(org, jobId)).resolves.toEqual({
      status: 'failed',
      error: 'No AI video credits are available on this account.',
    });
  });
});

describe('resolveTwoPhaseVideo', () => {
  it('still refuses providers without a plan/create pair', async () => {
    const { service } = makeService({ video: oneShotVideo() });
    const err = await service.resolveTwoPhaseVideo(org, body()).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
  });
});

// The modal's own render path (feature 006). The size is the promise the size
// tooltips make, so the preset id has to reach the renderer as exact pixels;
// legacy generateImage() keeps its fixed square for its other callers.
describe('generateImageWithPrompt', () => {
  const IMAGE_FILE = 'https://media/abc.jpg';
  const flagged = () =>
    new Error('400 Your request was rejected by the safety system');

  it.each([
    ['square', '1024x1024'],
    ['portrait', '1024x1280'],
    ['story', '1008x1792'],
    ['landscape', '1792x1008'],
  ])('renders the %s preset at exactly %s', async (aspectRatio, size) => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service, dto({ aspectRatio }));

    expect(ai.generateImageAtSize).toHaveBeenCalledWith('an enhanced scene', size);
  });

  // The pixels are settled by the pre-flight, before the stream opens, so the
  // render is handed a size rather than a preset id it could misread.
  it('resolves the preset to its pixels without rendering anything', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await expect(
      service.resolveImageWithPrompt(org, dto({ aspectRatio: 'portrait' }))
    ).resolves.toEqual({ size: '1024x1280', inputs: [] });
    expect(ai.generateImageAtSize).not.toHaveBeenCalled();
  });

  it('hands the enhancement the user\'s prompt verbatim', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service);

    expect(ai.generatePromptForPicture).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      undefined,
      0
    );
  });

  // The wire carries a style id; the English phrase behind it never leaves the
  // server, so the client cannot smuggle its own instructions to the model.
  it('resolves a chosen style to its catalog phrase', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service, dto({ style: 'watercolor' }));

    expect(ai.generatePromptForPicture).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      'a watercolour painting with soft bleeding washes',
      0
    );
  });

  it('imposes no style when the request omits one', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service, dto({ style: undefined }));

    expect(ai.generatePromptForPicture.mock.calls[0][1]).toBeUndefined();
  });

  // The enhancement returns '' when the model refuses or its reply will not
  // parse. Passing that on asks the renderer for an empty prompt, which 400s
  // as an invalid parameter and reaches the user as a generic failure — a dead
  // end for a request that would have worked on their own words.
  it('falls back to the user\'s prompt when the enhancement comes back empty', async () => {
    const ai = openAi();
    ai.generatePromptForPicture.mockResolvedValue('');
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service);

    expect(ai.generateImageAtSize).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      '1024x1024'
    );
  });

  // FR-013: one image per request, never a set of variations.
  it('renders exactly one image', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await generateWithPrompt(service);

    expect(ai.generateImageAtSize).toHaveBeenCalledTimes(1);
  });

  // The stream's one terminal frame carries the saved record, so what the
  // window attaches is exactly what Media now holds.
  it('yields a single done frame carrying the saved media record', async () => {
    const { service } = makeService({ openAi: openAi(), file: IMAGE_FILE });

    expect(await generateWithPrompt(service)).toEqual([
      { name: 'done', media: { id: 'media-1', path: IMAGE_FILE } },
    ]);
  });

  it('uploads the render as a JPEG and saves it under the uploaded name', async () => {
    const { service, saveFile } = makeService({
      openAi: openAi(),
      file: IMAGE_FILE,
    });

    await generateWithPrompt(service);

    expect((service as any).storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/jpeg;base64,' + Buffer.from('JPEG-BYTES').toString('base64')
    );
    expect(saveFile).toHaveBeenCalledWith('org-1', 'abc.jpg', IMAGE_FILE);
  });

  it('spends one ai_images credit', async () => {
    const { service, subscription } = makeService({ openAi: openAi() });

    await generateWithPrompt(service);

    expect(subscription.useCredit).toHaveBeenCalledWith(
      org,
      'ai_images',
      expect.any(Function)
    );
    expect(subscription.useCredit).toHaveBeenCalledTimes(1);
  });

  // Charge-on-success is the whole reason the work sits inside the callback:
  // a credit that is never committed must leave the renderer, the bucket and
  // the library untouched.
  it('does no work outside the credit callback', async () => {
    const ai = openAi();
    const { service, saveFile } = makeService({
      openAi: ai,
      spendCredit: false,
    });

    await generateWithPrompt(service);

    expect(ai.generatePromptForPicture).not.toHaveBeenCalled();
    expect(ai.generateImageAtSize).not.toHaveBeenCalled();
    expect((service as any).storage.uploadSimple).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();
  });

  // One credit is one image in Media: a render whose save fails delivered
  // nothing, so its credit is refunded like any other failure.
  it('refunds the credit when the image cannot be saved', async () => {
    const { service, saveFile, charged } = makeService({ openAi: openAi() });
    saveFile.mockRejectedValue(new Error('insert failed'));

    const err = await generateWithPrompt(service).catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(charged.value).toBe(false);
  });

  it('normalises provider failures through generationError', async () => {
    const ai = openAi();
    ai.generateImageAtSize.mockRejectedValue(
      new Error('rejected by the safety system')
    );
    const { service } = makeService({ openAi: ai });

    const err = await generateWithPrompt(service).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(422);
  });

  // A flagged prompt used to be a dead end: the same words fail the same way,
  // so the user's only move was to guess which part offended the checker.
  describe('safety-flag recovery', () => {
    it('rewrites once and retries when the render is flagged', async () => {
      const ai = openAi();
      ai.generateImageAtSize
        .mockRejectedValueOnce(flagged())
        .mockResolvedValueOnce(Buffer.from('RETRY-BYTES'));
      const { service } = makeService({ openAi: ai });

      await generateWithPrompt(service);

      expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledTimes(1);
      expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledWith('an enhanced scene');
      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(2);
      expect(ai.generateImageAtSize).toHaveBeenLastCalledWith(
        'an anonymous scene',
        '1024x1024'
      );
      expect((service as any).storage.uploadSimple).toHaveBeenCalledWith(
        'data:image/jpeg;base64,' + Buffer.from('RETRY-BYTES').toString('base64')
      );
    });

    it('charges exactly one credit for a generation that needed the retry', async () => {
      const ai = openAi();
      ai.generateImageAtSize
        .mockRejectedValueOnce(flagged())
        .mockResolvedValueOnce(Buffer.from('RETRY-BYTES'));
      const { service, subscription, charged } = makeService({ openAi: ai });

      await generateWithPrompt(service);

      expect(subscription.useCredit).toHaveBeenCalledTimes(1);
      expect(charged.value).toBe(true);
    });

    it('gives up after a second flag, without charging', async () => {
      const ai = openAi();
      ai.generateImageAtSize.mockRejectedValue(flagged());
      const { service, charged } = makeService({ openAi: ai });

      const err = await generateWithPrompt(service).catch((e) => e);

      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(2);
      expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledTimes(1);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(charged.value).toBe(false);
    });

    // An invalid-parameter 400 is not a content problem — rewriting the prompt
    // would burn a model call and change the user's request for nothing.
    it('does not rewrite an ordinary failure', async () => {
      const ai = openAi();
      ai.generateImageAtSize.mockRejectedValue(new Error('socket hang up'));
      const { service, charged } = makeService({ openAi: ai });

      const err = await generateWithPrompt(service).catch((e) => e);

      expect(ai.rewriteFlaggedPrompt).not.toHaveBeenCalled();
      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(1);
      expect(err.getStatus()).toBe(500);
      expect(charged.value).toBe(false);
    });

    // Empty means the rewrite itself failed; retrying the flagged prompt
    // verbatim would just buy the same rejection a second time.
    it('reports the original flag when the rewrite comes back empty', async () => {
      const ai = openAi();
      ai.generateImageAtSize.mockRejectedValue(flagged());
      ai.rewriteFlaggedPrompt.mockResolvedValue('');
      const { service, charged } = makeService({ openAi: ai });

      const err = await generateWithPrompt(service).catch((e) => e);

      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(1);
      expect(err.getStatus()).toBe(422);
      expect(charged.value).toBe(false);
    });
  });
});

// References ride the same route: Media rows the render draws on, for the same
// single credit (feature 031-ai-image-references-edit, US1). Everything a
// reference can be refused for is found in the pre-flight, before the stream
// opens and before a credit exists.
describe('generateImageWithPrompt with references', () => {
  const MB = 1024 * 1024;
  const flagged = () =>
    new Error('400 Your request was rejected by the safety system');
  const row = (id: string) => ({ id, path: `https://media/${id}` });

  // What each stored file holds, by path. Real images, tiny wherever size does
  // not matter: normalization is sharp's real code path, which a double would
  // only restate.
  const stored: Record<string, Buffer> = {};
  const picture = (width: number, height: number, channels: 3 | 4 = 3) =>
    sharp({
      create: {
        width,
        height,
        channels,
        background: { r: 185, g: 45, b: 67, alpha: channels === 4 ? 0.5 : 1 },
      },
    });

  // Two 1×1 frames. sharp 0.33 cannot write a multi-page GIF from scratch, so
  // the bytes are spelled out: header, screen, a two-colour palette, then a
  // graphic control block and an image per frame.
  const twoFrameGif = () => {
    const frame = [
      0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
    ];
    return Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
      0x00, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, ...frame, ...frame, 0x3b,
    ]);
  };

  // A 1×1 24-bit BMP, the 58 bytes of research R6: uploads accept the format
  // and sharp cannot decode it.
  const bmp = () => {
    const bytes = Buffer.alloc(58);
    bytes.write('BM', 0, 'ascii');
    bytes.writeUInt32LE(58, 2);
    bytes.writeUInt32LE(54, 10);
    bytes.writeUInt32LE(40, 14);
    bytes.writeInt32LE(1, 18);
    bytes.writeInt32LE(1, 22);
    bytes.writeUInt16LE(1, 26);
    bytes.writeUInt16LE(24, 28);
    bytes.writeUInt32LE(4, 34);
    return bytes;
  };

  beforeAll(async () => {
    stored['https://media/jpeg'] = await picture(16, 16).jpeg().toBuffer();
    stored['https://media/alpha'] = await picture(16, 16, 4).png().toBuffer();
    stored['https://media/large'] = await picture(3000, 2000).jpeg().toBuffer();
    stored['https://media/rotated'] = await picture(40, 20)
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    stored['https://media/avif'] = await picture(16, 16).avif().toBuffer();
    stored['https://media/gif'] = twoFrameGif();
    stored['https://media/bmp'] = bmp();
  });

  beforeEach(() => {
    read.mockImplementation(async (path: string) => stored[path]);
  });

  const prepare = (service: MediaService, references: string[]) =>
    service.resolveImageWithPrompt(org, dto({ references }));

  it('looks the ids up in the asking organization\'s library', async () => {
    const { service, repository } = makeService({
      openAi: openAi(),
      references: [row('jpeg'), row('alpha')],
    });

    await prepare(service, ['jpeg', 'alpha']);

    expect(repository.getMediaByIds).toHaveBeenCalledWith('org-1', [
      'jpeg',
      'alpha',
    ]);
  });

  // The Media library promises 30 MB in the browser and its multipart upload
  // path never checks it on the server (research R5).
  it('reads every reference with the 30 MB bound', async () => {
    const { service } = makeService({
      openAi: openAi(),
      references: [row('jpeg'), row('alpha')],
    });

    await prepare(service, ['jpeg', 'alpha']);

    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith('https://media/jpeg', 30 * MB);
    expect(read).toHaveBeenCalledWith('https://media/alpha', 30 * MB);
  });

  // `index` is the number on the thumbnail, so the window can say which one.
  describe('refuses before any credit exists', () => {
    it('names a reference that is no longer in the library by its position', async () => {
      const { service, subscription } = makeService({
        openAi: openAi(),
        references: [row('jpeg')],
      });

      const err = await prepare(service, ['jpeg', 'deleted']).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(404);
      expect(err.getResponse()).toMatchObject({
        code: 'reference_missing',
        index: 2,
      });
      expect(read).not.toHaveBeenCalled();
      expect(subscription.useCredit).not.toHaveBeenCalled();
    });

    // The query filters on the organization, so another workspace's id comes
    // back as nothing at all; the answer says no more than "missing".
    it('answers an id from another organization exactly as a missing one', async () => {
      const { service } = makeService({ openAi: openAi(), references: [] });

      const err = await prepare(service, ['theirs']).catch((e) => e);

      expect(err.getStatus()).toBe(404);
      expect(err.getResponse()).toEqual({
        message: 'Reference image 1 is no longer in your Media library.',
        code: 'reference_missing',
        index: 1,
      });
    });

    it('names a reference larger than the bound without reading it', async () => {
      read.mockImplementation(async (path: string) => {
        if (path === 'https://media/huge') {
          throw new MediaTooLargeError(30 * MB, 31 * MB);
        }
        return stored[path];
      });
      const { service, subscription } = makeService({
        openAi: openAi(),
        references: [row('jpeg'), row('huge')],
      });

      const err = await prepare(service, ['jpeg', 'huge']).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(err.getResponse()).toMatchObject({
        code: 'reference_too_large',
        index: 2,
      });
      expect(subscription.useCredit).not.toHaveBeenCalled();
    });

    it('names a reference it cannot decode', async () => {
      const { service, subscription } = makeService({
        openAi: openAi(),
        references: [row('bmp'), row('jpeg')],
      });

      const err = await prepare(service, ['bmp', 'jpeg']).catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(422);
      expect(err.getResponse()).toMatchObject({
        code: 'reference_unreadable',
        index: 1,
      });
      expect(subscription.useCredit).not.toHaveBeenCalled();
    });
  });

  describe('normalizes what reaches the provider', () => {
    const inputFor = async (id: string) => {
      const { service } = makeService({
        openAi: openAi(),
        references: [row(id)],
      });
      const [input] = (await prepare(service, [id])).inputs;
      return { mime: input.mime, ...(await sharp(input.data).metadata()) };
    };

    // A logo keeps its transparency.
    it('keeps an image with transparency as PNG', async () => {
      expect(await inputFor('alpha')).toMatchObject({
        mime: 'image/png',
        format: 'png',
        hasAlpha: true,
      });
    });

    // Gate G1: input tokens grow with resolution past what the render can
    // use, and 1792 px is the presets' longest edge (research R6).
    it('fits a large photo inside 1792 px, as JPEG', async () => {
      expect(await inputFor('large')).toMatchObject({
        mime: 'image/jpeg',
        format: 'jpeg',
        width: 1792,
        height: 1195,
      });
    });

    // Phone photos carry their rotation as an EXIF tag the provider may not
    // apply, and would arrive on their side.
    it('turns a photo upright', async () => {
      expect(await inputFor('rotated')).toMatchObject({
        width: 20,
        height: 40,
      });
    });

    it.each([
      ['an AVIF', 'avif'],
      ['an animated GIF', 'gif'],
    ])('makes %s a single-frame PNG or JPEG', async (_case, id) => {
      const input = await inputFor(id);

      expect(['image/png', 'image/jpeg']).toContain(input.mime);
      expect(input.format).toBe(input.mime.replace('image/', ''));
      expect(input.pages ?? 1).toBe(1);
    });
  });

  it('keeps the order the user attached them in', async () => {
    // The database answers in its own order.
    const { service } = makeService({
      openAi: openAi(),
      references: [row('alpha'), row('jpeg')],
    });

    const { inputs } = await prepare(service, ['jpeg', 'alpha']);

    expect(inputs.map((input) => input.mime)).toEqual([
      'image/jpeg',
      'image/png',
    ]);
  });

  it('renders through the edit call with the prepared inputs', async () => {
    const ai = openAi();
    const { service } = makeService({
      openAi: ai,
      references: [row('jpeg'), row('alpha')],
    });
    const request = dto({ references: ['jpeg', 'alpha'] });
    const prepared = await service.resolveImageWithPrompt(org, request);

    await drain(service.generateImageWithPrompt(org, request, prepared));

    expect(ai.editImageAtSize).toHaveBeenCalledTimes(1);
    expect(ai.editImageAtSize).toHaveBeenCalledWith(
      'an enhanced scene',
      '1024x1024',
      prepared.inputs
    );
    expect(ai.generateImageAtSize).not.toHaveBeenCalled();
    expect((service as any).storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/jpeg;base64,' + Buffer.from('EDIT-BYTES').toString('base64')
    );
  });

  // SC-007: a render without references is today's render, call for call.
  it.each([
    ['absent', undefined],
    ['empty', []],
  ])('keeps the plain render when the list is %s', async (_case, references) => {
    const ai = openAi();
    const { service, repository } = makeService({ openAi: ai });

    await generateWithPrompt(service, dto({ references }));

    expect(ai.generateImageAtSize).toHaveBeenCalledWith(
      'an enhanced scene',
      '1024x1024'
    );
    expect(ai.editImageAtSize).not.toHaveBeenCalled();
    expect(repository.getMediaByIds).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  // The improver never sees the images; told nothing, it describes a subject
  // that competes with the one in the picture (research R7).
  it('tells the enhancement how many references there are', async () => {
    const ai = openAi();
    const { service } = makeService({
      openAi: ai,
      references: [row('jpeg'), row('alpha')],
    });

    await generateWithPrompt(
      service,
      dto({ style: 'watercolor', references: ['jpeg', 'alpha'] })
    );

    expect(ai.generatePromptForPicture).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      'a watercolour painting with soft bleeding washes',
      2
    );
  });

  it('retries a flagged render through the edit call, with the same inputs', async () => {
    const ai = openAi();
    ai.editImageAtSize
      .mockRejectedValueOnce(flagged())
      .mockResolvedValueOnce(Buffer.from('RETRY-BYTES'));
    const { service } = makeService({
      openAi: ai,
      references: [row('jpeg')],
    });

    await generateWithPrompt(service, dto({ references: ['jpeg'] }));

    expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledWith('an enhanced scene');
    expect(ai.editImageAtSize).toHaveBeenCalledTimes(2);
    expect(ai.editImageAtSize.mock.calls[1][0]).toBe('an anonymous scene');
    expect(ai.editImageAtSize.mock.calls[1][2]).toBe(
      ai.editImageAtSize.mock.calls[0][2]
    );
    expect(ai.generateImageAtSize).not.toHaveBeenCalled();
  });

  // Four references at one credit was the maintainer's call; gate G1 measured
  // the cap at 1.91× a plain render's cost.
  it.each([0, 1, IMAGE_REFERENCE_MAX])(
    'spends exactly one credit for %s references',
    async (count) => {
      const ids = ['jpeg', 'alpha', 'avif', 'gif'].slice(0, count);
      const { service, subscription, charged } = makeService({
        openAi: openAi(),
        references: ids.map(row),
      });

      await generateWithPrompt(service, dto({ references: ids }));

      expect(subscription.useCredit).toHaveBeenCalledTimes(1);
      expect(subscription.useCredit).toHaveBeenCalledWith(
        org,
        'ai_images',
        expect.any(Function)
      );
      expect(charged.value).toBe(true);
    }
  );
});

// The image allowance used to be enforced by whichever route remembered to ask,
// so the wizard, autopost and Samy each generated unmetered. Both image methods
// now refuse for themselves — the same shape `resolveVideo` gives videos — which
// is what makes every caller metered by construction rather than by discipline.
describe('image credit enforcement', () => {
  // Read once at collection time, restored after every case: the gate is an
  // env var, and a test that leaves it set decides the outcome of the next one.
  const initial = process.env.STRIPE_PUBLISHABLE_KEY;
  const billing = (enabled: boolean) => {
    if (enabled) {
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_billing_on';
      return;
    }
    delete process.env.STRIPE_PUBLISHABLE_KEY;
  };

  afterEach(() => {
    if (initial === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      return;
    }
    process.env.STRIPE_PUBLISHABLE_KEY = initial;
  });

  describe('with the allowance exhausted', () => {
    beforeEach(() => billing(true));

    // The refusal has to land before the credit row exists and before the
    // renderer is asked for anything: an org with nothing left must cost
    // neither a credit nor a generation.
    it('refuses generateImage without touching the renderer or a credit', async () => {
      const ai = openAi();
      const { service, subscription, charged } = makeService({
        credits: 0,
        openAi: ai,
      });

      await expect(
        service.generateImage('a pomegranate', org)
      ).rejects.toBeInstanceOf(SubscriptionException);

      expect(subscription.checkCredits).toHaveBeenCalledWith(org, 'ai_images');
      expect(subscription.useCredit).not.toHaveBeenCalled();
      expect(ai.generateImage).not.toHaveBeenCalled();
      expect(charged.value).toBe(false);
    });

    // The image route's pre-flight, awaited before its stream opens: the
    // refusal must still be a real 402, so nothing may have run by then.
    it('refuses resolveImageWithPrompt without touching OpenAI or a credit', async () => {
      const ai = openAi();
      const { service, subscription, charged } = makeService({
        credits: 0,
        openAi: ai,
      });

      await expect(
        service.resolveImageWithPrompt(org, dto())
      ).rejects.toBeInstanceOf(SubscriptionException);

      expect(subscription.checkCredits).toHaveBeenCalledWith(org, 'ai_images');
      expect(subscription.useCredit).not.toHaveBeenCalled();
      for (const method of Object.values(ai)) {
        expect(method).not.toHaveBeenCalled();
      }
      expect(charged.value).toBe(false);
    });

    // The allowance is checked before any reference is looked up or read: an
    // organization with nothing left must not cost four storage reads either.
    it('refuses before looking up or reading a single reference', async () => {
      const { service, repository } = makeService({
        credits: 0,
        openAi: openAi(),
        references: [{ id: 'a', path: 'https://media/a' }],
      });

      await expect(
        service.resolveImageWithPrompt(org, dto({ references: ['a'] }))
      ).rejects.toBeInstanceOf(SubscriptionException);

      expect(repository.getMediaByIds).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
    });

    // generationError normalises anything the render throws, and it passes an
    // HttpException through untouched — so the 402 must survive as itself
    // rather than arriving as a generic 500 the billing dialog cannot read.
    it('keeps the refusal a 402 rather than a generation failure', async () => {
      const { service } = makeService({ credits: 0, openAi: openAi() });

      const err = await service.generateImage('a pomegranate', org).catch((e) => e);

      expect(err.getStatus()).toBe(402);
    });
  });

  describe('with credits remaining', () => {
    beforeEach(() => billing(true));

    it('generates and charges as before', async () => {
      const ai = openAi();
      const { service, subscription, charged } = makeService({ openAi: ai });

      await expect(service.generateImage('a pomegranate', org)).resolves.toBe(
        'LEGACYB64'
      );

      expect(ai.generateImage).toHaveBeenCalledWith('a pomegranate');
      expect(subscription.useCredit).toHaveBeenCalledWith(
        org,
        'ai_images',
        expect.any(Function)
      );
      expect(charged.value).toBe(true);
    });

    // Charge-on-success: the pre-flight admits the render, but a render that
    // never delivers must still leave the allowance where it was.
    it('leaves the allowance alone when the render fails', async () => {
      const ai = openAi();
      ai.generateImage.mockRejectedValue(new Error('socket hang up'));
      const { service, charged } = makeService({ openAi: ai });

      const err = await service
        .generateImage('a pomegranate', org)
        .catch((e) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(500);
      expect(charged.value).toBe(false);
    });
  });

  // Self-hosted deployments have no payment provider, so there is no allowance
  // to spend down — the balance is not even consulted, and generation stays
  // unlimited exactly as it is today. Usage is still recorded.
  describe('with billing not configured', () => {
    beforeEach(() => billing(false));

    it('never consults the allowance for generateImage', async () => {
      const { service, subscription, charged } = makeService({
        credits: 0,
        openAi: openAi(),
      });

      await expect(service.generateImage('a pomegranate', org)).resolves.toBe(
        'LEGACYB64'
      );

      expect(subscription.checkCredits).not.toHaveBeenCalled();
      expect(charged.value).toBe(true);
    });

    it('never consults the allowance for generateImageWithPrompt', async () => {
      const { service, subscription } = makeService({
        credits: 0,
        openAi: openAi(),
      });

      await expect(generateWithPrompt(service)).resolves.toEqual([
        expect.objectContaining({ name: 'done' }),
      ]);

      expect(subscription.checkCredits).not.toHaveBeenCalled();
    });
  });
});

// Every credit refusal quotes the window the balance was read against, so the
// date the customer is shown cannot disagree with the call that refused them.
describe('every credit refusal carries its reset date', () => {
  // Only the image path is gated on the payment provider; set it for all three
  // so the table stays one case per throw site.
  const initial = process.env.STRIPE_PUBLISHABLE_KEY;
  beforeEach(() => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_billing_on';
  });
  afterEach(() => {
    if (initial === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      return;
    }
    process.env.STRIPE_PUBLISHABLE_KEY = initial;
  });

  const refusals: [string, (service: MediaService) => Promise<unknown>][] = [
    ['resolveVideo', (service) => service.resolveVideo(org, body())],
    [
      'generateVideoAllowed',
      (service) => service.generateVideoAllowed(org, 'veo3'),
    ],
    ['generateImage', (service) => service.generateImage('a pomegranate', org)],
  ];

  it.each(refusals)('%s', async (_path, refuse) => {
    const { service } = makeService({
      credits: 0,
      video: oneShotVideo(),
      openAi: openAi(),
    });

    const err = await refuse(service).catch((e) => e);

    expect(err).toBeInstanceOf(SubscriptionException);
    expect(err.getResponse()).toMatchObject({ resetsAt: RESETS_AT });
  });
});
