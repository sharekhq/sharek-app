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

const openAi = () => ({
  generateImage: jest.fn().mockResolvedValue('LEGACYB64'),
  generatePromptForPicture: jest.fn().mockResolvedValue('an enhanced scene'),
  generateImageAtSize: jest.fn().mockResolvedValue(Buffer.from('JPEG-BYTES')),
  rewriteFlaggedPrompt: jest.fn().mockResolvedValue('an anonymous scene'),
});

const dto = (over: Partial<Record<string, any>> = {}) =>
  ({ prompt: 'قهوة مختصة في الرياض', aspectRatio: 'square', ...over } as any);

// The real checkCredits returns the far end of the window it counted usage
// over alongside the balance; a refusal quotes it.
const RESETS_AT = '2026-09-12T08:31:04.000Z';

const makeService = (
  over: { credits?: number; video?: any; openAi?: any; spendCredit?: boolean } = {}
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

    it('refuses generateImageWithPrompt without touching the renderer or a credit', async () => {
      const ai = openAi();
      const { service, subscription, charged } = makeService({
        credits: 0,
        openAi: ai,
      });

      await expect(
        service.generateImageWithPrompt(dto(), org)
      ).rejects.toBeInstanceOf(SubscriptionException);

      expect(subscription.checkCredits).toHaveBeenCalledWith(org, 'ai_images');
      expect(subscription.useCredit).not.toHaveBeenCalled();
      expect(ai.generatePromptForPicture).not.toHaveBeenCalled();
      expect(ai.generateImageAtSize).not.toHaveBeenCalled();
      expect(charged.value).toBe(false);
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

      await expect(service.generateImageWithPrompt(dto(), org)).resolves.toBe(
        Buffer.from('JPEG-BYTES').toString('base64')
      );

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
