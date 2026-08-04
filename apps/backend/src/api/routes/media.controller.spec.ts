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

const makeController = (media: Record<string, any>) => {
  const controller = new MediaController(media as any);
  (controller as any).storage = {
    uploadSimple: jest.fn().mockResolvedValue('https://media/abc.jpg'),
  };
  return controller;
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

describe('generateImageFromText', () => {
  it('propagates the refusal instead of answering false', async () => {
    const controller = makeController({
      generateImageWithPrompt: jest.fn().mockRejectedValue(refusal()),
    });

    await expect(
      controller.generateImageFromText(org, {} as any)
    ).rejects.toBeInstanceOf(SubscriptionException);
  });

  it('still throws anything that is not a refusal', async () => {
    const controller = makeController({
      generateImageWithPrompt: jest
        .fn()
        .mockRejectedValue(new HttpException('the renderer fell over', 500)),
    });

    const err = await controller
      .generateImageFromText(org, {} as any)
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(500);
  });

  it('still saves and answers the media record', async () => {
    const saveFile = jest.fn().mockResolvedValue({ id: 'media-1' });
    const controller = makeController({
      generateImageWithPrompt: jest.fn().mockResolvedValue('BASE64'),
      saveFile,
    });

    await expect(
      controller.generateImageFromText(org, {} as any)
    ).resolves.toEqual({ id: 'media-1' });
    expect(saveFile).toHaveBeenCalled();
  });
});
