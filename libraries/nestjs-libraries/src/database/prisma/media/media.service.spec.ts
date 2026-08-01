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

const makeService = (over: { credits?: number; video?: any } = {}) => {
  const subscription = {
    checkCredits: jest.fn().mockResolvedValue({ credits: over.credits ?? 1 }),
    useCredit: jest.fn((_org: any, _type: any, func: () => any) => func()),
  };
  const manager = { getVideoByName: jest.fn().mockReturnValue(over.video) };
  const service = new MediaService(
    {} as any,
    {} as any,
    subscription as any,
    manager as any
  );
  (service as any).storage = {
    uploadSimple: jest.fn().mockResolvedValue('https://media/abc.mp4'),
  };
  const saveFile = jest
    .spyOn(service, 'saveFile')
    .mockResolvedValue({ id: 'media-1', path: 'https://media/abc.mp4' } as any);
  return { service, subscription, saveFile };
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
