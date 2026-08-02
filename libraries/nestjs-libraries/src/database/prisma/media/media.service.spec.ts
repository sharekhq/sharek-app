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

import { HttpException } from '@nestjs/common';
import { MediaService } from './media.service';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

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

const makeService = (
  over: { credits?: number; video?: any; openAi?: any; spendCredit?: boolean } = {}
) => {
  // The real useCredit commits the credit only when its callback resolves and
  // refunds when it throws, so `charged` is what "no charge on failure" means.
  const charged = { value: false };
  const subscription = {
    checkCredits: jest.fn().mockResolvedValue({ credits: over.credits ?? 1 }),
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
  const service = new MediaService(
    {} as any,
    over.openAi ?? ({} as any),
    subscription as any,
    manager as any
  );
  (service as any).storage = {
    uploadSimple: jest.fn().mockResolvedValue('https://media/abc.mp4'),
  };
  const saveFile = jest
    .spyOn(service, 'saveFile')
    .mockResolvedValue({ id: 'media-1', path: 'https://media/abc.mp4' } as any);
  return { service, subscription, saveFile, charged };
};

const drain = async (gen: AsyncGenerator<any>) => {
  const frames = [];
  for await (const frame of gen) frames.push(frame);
  return frames;
};

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
  const openAi = () => ({
    generatePromptForPicture: jest.fn().mockResolvedValue('an enhanced scene'),
    generateImageAtSize: jest.fn().mockResolvedValue(Buffer.from('JPEG-BYTES')),
    rewriteFlaggedPrompt: jest.fn().mockResolvedValue('an anonymous scene'),
  });

  const flagged = () =>
    new Error('400 Your request was rejected by the safety system');

  const dto = (over: Partial<Record<string, any>> = {}) =>
    ({ prompt: 'قهوة مختصة في الرياض', aspectRatio: 'square', ...over } as any);

  it.each([
    ['square', '1024x1024'],
    ['portrait', '1024x1280'],
    ['story', '1008x1792'],
    ['landscape', '1792x1008'],
  ])('renders the %s preset at exactly %s', async (aspectRatio, size) => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await service.generateImageWithPrompt(dto({ aspectRatio }), org);

    expect(ai.generateImageAtSize).toHaveBeenCalledWith('an enhanced scene', size);
  });

  it('hands the enhancement the user\'s prompt verbatim', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await service.generateImageWithPrompt(dto(), org);

    expect(ai.generatePromptForPicture).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      undefined
    );
  });

  // The wire carries a style id; the English phrase behind it never leaves the
  // server, so the client cannot smuggle its own instructions to the model.
  it('resolves a chosen style to its catalog phrase', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await service.generateImageWithPrompt(dto({ style: 'watercolor' }), org);

    expect(ai.generatePromptForPicture).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      'a watercolour painting with soft bleeding washes'
    );
  });

  it('imposes no style when the request omits one', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await service.generateImageWithPrompt(dto({ style: undefined }), org);

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

    await service.generateImageWithPrompt(dto(), org);

    expect(ai.generateImageAtSize).toHaveBeenCalledWith(
      'قهوة مختصة في الرياض',
      '1024x1024'
    );
  });

  // FR-013: one image per request, never a set of variations.
  it('renders exactly one image', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai });

    await service.generateImageWithPrompt(dto(), org);

    expect(ai.generateImageAtSize).toHaveBeenCalledTimes(1);
  });

  it('returns the image as base64', async () => {
    const { service } = makeService({ openAi: openAi() });

    expect(await service.generateImageWithPrompt(dto(), org)).toBe(
      Buffer.from('JPEG-BYTES').toString('base64')
    );
  });

  it('spends one ai_images credit', async () => {
    const { service, subscription } = makeService({ openAi: openAi() });

    await service.generateImageWithPrompt(dto(), org);

    expect(subscription.useCredit).toHaveBeenCalledWith(
      org,
      'ai_images',
      expect.any(Function)
    );
    expect(subscription.useCredit).toHaveBeenCalledTimes(1);
  });

  // Charge-on-success is the whole reason the work sits inside the callback:
  // a credit that is never committed must leave the renderer untouched.
  it('does no work outside the credit callback', async () => {
    const ai = openAi();
    const { service } = makeService({ openAi: ai, spendCredit: false });

    await service.generateImageWithPrompt(dto(), org);

    expect(ai.generatePromptForPicture).not.toHaveBeenCalled();
    expect(ai.generateImageAtSize).not.toHaveBeenCalled();
  });

  it('normalises provider failures through generationError', async () => {
    const ai = openAi();
    ai.generateImageAtSize.mockRejectedValue(
      new Error('rejected by the safety system')
    );
    const { service } = makeService({ openAi: ai });

    const err = await service
      .generateImageWithPrompt(dto(), org)
      .catch((e) => e);
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

      const result = await service.generateImageWithPrompt(dto(), org);

      expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledTimes(1);
      expect(ai.rewriteFlaggedPrompt).toHaveBeenCalledWith('an enhanced scene');
      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(2);
      expect(ai.generateImageAtSize).toHaveBeenLastCalledWith(
        'an anonymous scene',
        '1024x1024'
      );
      expect(result).toBe(Buffer.from('RETRY-BYTES').toString('base64'));
    });

    it('charges exactly one credit for a generation that needed the retry', async () => {
      const ai = openAi();
      ai.generateImageAtSize
        .mockRejectedValueOnce(flagged())
        .mockResolvedValueOnce(Buffer.from('RETRY-BYTES'));
      const { service, subscription, charged } = makeService({ openAi: ai });

      await service.generateImageWithPrompt(dto(), org);

      expect(subscription.useCredit).toHaveBeenCalledTimes(1);
      expect(charged.value).toBe(true);
    });

    it('gives up after a second flag, without charging', async () => {
      const ai = openAi();
      ai.generateImageAtSize.mockRejectedValue(flagged());
      const { service, charged } = makeService({ openAi: ai });

      const err = await service
        .generateImageWithPrompt(dto(), org)
        .catch((e) => e);

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

      const err = await service
        .generateImageWithPrompt(dto(), org)
        .catch((e) => e);

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

      const err = await service
        .generateImageWithPrompt(dto(), org)
        .catch((e) => e);

      expect(ai.generateImageAtSize).toHaveBeenCalledTimes(1);
      expect(err.getStatus()).toBe(422);
      expect(charged.value).toBe(false);
    });
  });
});
