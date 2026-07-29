import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import {
  CreateVideoDto,
  VideoDto,
} from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
            console.log('Prompt:', prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName);
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const totalCredits = await this._subscriptionService.checkCredits(
        org,
        'ai_videos'
      );

      if (totalCredits.credits <= 0) {
        throw new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.VIDEOS_PER_MONTH,
        });
      }

      const video = this._videoManager.getVideoByName(body.type);
      if (!video) {
        throw new Error(`Video type ${body.type} not found`);
      }

      if (!video.trial && org.isTrailing) {
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      console.log(body.customParams);
      await video.instance.processAndValidate(body.customParams);
      console.log('no err');

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * Shared gate for both phases. Awaited by the controller *before* the create
   * route commits to a streamed response, so a credit or trial refusal is still
   * a real HTTP status the billing and finish-trial dialogs can act on rather
   * than an in-band error frame delivered with a 200.
   *
   * Credits are checked but not spent here: the credit belongs to the render,
   * and a user with none should find out before writing a script (D33).
   */
  async resolveTwoPhaseVideo(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new HttpException(`Video type ${body.type} not found`, 404);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    // The two-phase flow is optional on the provider interface, so a provider
    // that only implements process() must be refused cleanly rather than
    // crashing on an undefined method.
    if (!video.instance.plan || !video.instance.create) {
      throw new HttpException(
        `${body.type} does not support reviewing a script before rendering`,
        400
      );
    }

    await video.instance.processAndValidate(body.customParams);

    return video;
  }

  async planVideo(org: Organization, body: VideoDto) {
    try {
      const video = await this.resolveTwoPhaseVideo(org, body);
      return await video.instance.plan!(body.customParams);
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * Phase two. Yields the provider's progress events through to the controller
   * so the HTTP response keeps producing bytes for the whole render.
   *
   * `video` comes from an already-awaited resolveTwoPhaseVideo, so everything
   * that can fail with a meaningful status has failed before the stream opened.
   */
  async *createVideo(
    org: Organization,
    body: CreateVideoDto,
    video: NonNullable<ReturnType<VideoManager['getVideoByName']>>
  ) {
    // useCredit deletes its credit row when the wrapped call throws, so a
    // failed render is not billed. Collect inside the wrapper and re-yield
    // outside it so a mid-render client disconnect still propagates a throw.
    const events: any[] = [];
    let saved: any;

    try {
      saved = await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          let url = '';
          for await (const event of video.instance.create!(
            body.output,
            body.storyboard,
            body.customParams
          )) {
            if (event.name === 'done') {
              url = event.url;
            } else {
              events.push(event);
            }
          }
          if (!url) {
            throw new Error('Video generation produced no output');
          }
          const file = await this.storage.uploadSimple(url);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      // Same normalisation the one-shot route applies, so a provider safety
      // rejection reaches the user as itself rather than as a generic failure.
      throw generationError(err);
    }

    for (const event of events) {
      yield event;
    }
    yield { name: 'done', media: saved };
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    // Invoke bound to the provider instance — a detached call leaves `this`
    // undefined inside methods that use other instance members (loadVoices).
    return functionToCall.call(video.instance, body);
  }
}
