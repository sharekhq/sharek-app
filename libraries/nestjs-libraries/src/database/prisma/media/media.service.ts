import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  generationError,
  isSafetyRejection,
} from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { GenerateImageWithPromptDto } from '@gitroom/nestjs-libraries/dtos/media/generate.image.dto';
import {
  IMAGE_ASPECT_PRESETS,
  IMAGE_STYLES,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
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

  /**
   * Shared pre-flight for every image render, the counterpart of
   * `resolveVideo`. It belongs to the service and not to a route because the
   * routes were never the only callers — the post generator, autopost and the
   * assistant reach these two methods directly, and each surface that had to
   * remember the check on its own eventually forgot it.
   *
   * Gated on a configured payment provider: a self-hosted deployment has no
   * subscription, which `checkCredits` reads as tier FREE and therefore zero
   * allowance — without this gate every such install would refuse outright.
   * Usage is still recorded there, it is simply never enforced.
   */
  private async resolveImage(org: Organization) {
    if (!process.env.STRIPE_PUBLISHABLE_KEY) {
      return;
    }

    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_images'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.IMAGES_PER_MONTH,
        resetsAt: totalCredits.resetsAt,
      });
    }
  }

  async generateImage(prompt: string, org: Organization) {
    // Outside the try below: a refusal is not a generation failure, and it must
    // reach the caller as the 402 it is rather than as a normalised render
    // error, because that is the status the surfaces branch on.
    await this.resolveImage(org);

    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => this._openAi.generateImage(prompt)
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * The AI image modal's own render path. The client sends a size preset id and
   * the pixels are resolved here, so a tampered client cannot ask for an
   * arbitrary render, and the exact dimensions the size tooltips promise are
   * the ones the renderer is given.
   *
   * Everything — including the flagged-prompt retry — sits inside the credit
   * callback: charge-on-success means a generation that never happens must
   * never reach the renderer either, and a generation that only succeeded on
   * the second attempt still costs exactly one credit.
   */
  async generateImageWithPrompt(
    dto: GenerateImageWithPromptDto,
    org: Organization
  ) {
    await this.resolveImage(org);

    try {
      return await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          // The wire carries a style id; the phrase behind it is resolved here
          // so the client cannot hand the model instructions of its own.
          const style = IMAGE_STYLES.find(
            (entry) => entry.id === dto.style
          )?.prompt;
          // The enhancement yields '' when the model refuses or its reply will
          // not parse. Sending that on asks the renderer for an empty prompt —
          // an invalid-parameter 400 the user reads as a generic failure — so
          // fall back to their own words, as the video providers do.
          const enhanced = await this._openAi.generatePromptForPicture(
            dto.prompt,
            style
          );
          const prompt = enhanced || dto.prompt;

          const size = IMAGE_ASPECT_PRESETS[dto.aspectRatio].size;
          const render = async (text: string) =>
            (await this._openAi.generateImageAtSize(text, size)).toString(
              'base64'
            );

          try {
            return await render(prompt);
          } catch (err) {
            // Same recovery the slides renderer uses: a content flag is worth
            // one sanitized retry, an ordinary failure is not. A second flag
            // falls through to generationError's 422 with its categories.
            if (!isSafetyRejection(err)) {
              throw err;
            }

            const rewritten = await this._openAi.rewriteFlaggedPrompt(prompt);
            if (!rewritten) {
              throw err;
            }

            return await render(rewritten);
          }
        }
      );
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

    // The same guard `resolveVideo` applies, mirrored here so the answer this
    // pre-flight gives matches the answer the render would give. Without it the
    // client is told "allowed", opens a waiting screen, and only then meets the
    // billing dialog — which stops the request dead, so the screen never learns
    // the render was refused and waits forever.
    //
    // Deliberately *after* the trial check, not before it as in `resolveVideo`:
    // this endpoint already answered 406 for a trialing org and the
    // finish-trial dialog keys off that status.
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
        resetsAt: totalCredits.resetsAt,
      });
    }

    return true;
  }

  /**
   * Shared pre-flight for every render path. Awaited by the controllers
   * *before* a streamed response is committed to, so a credit or trial refusal
   * is still a real HTTP status the billing and finish-trial dialogs can act on
   * rather than an in-band error frame delivered with a 200.
   *
   * Credits are checked but not spent here: the credit belongs to the render,
   * and a user with none should find out before writing a script (D33).
   */
  async resolveVideo(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
        resetsAt: totalCredits.resetsAt,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new HttpException(`Video type ${body.type} not found`, 404);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    await video.instance.processAndValidate(body.customParams);

    return video;
  }

  /**
   * One-shot render as a stream. `process()` has no progress events, so the
   * single frame is the terminal one — the controller's heartbeat wrapper
   * supplies the keep-alives in between. Unlike the two-phase flow the render
   * cannot be cancelled mid-flight (a promise has no yield points), so a
   * client that disconnects still gets the finished video in the media
   * library, on the credit that was already committed.
   */
  async *processVideo(
    org: Organization,
    body: VideoDto,
    video: NonNullable<ReturnType<VideoManager['getVideoByName']>>
  ) {
    let saved: any;
    try {
      saved = await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const url = await video.instance.process(
            body.output,
            body.customParams
          );
          const file = await this.storage.uploadSimple(url);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }

    yield { name: 'done', media: saved };
  }

  async generateVideo(org: Organization, body: VideoDto) {
    const video = await this.resolveVideo(org, body);
    for await (const event of this.processVideo(org, body, video)) {
      if (event.name === 'done') {
        return event.media;
      }
    }

    throw new HttpException(
      'AI generation failed, please try again later.',
      500
    );
  }

  async resolveTwoPhaseVideo(org: Organization, body: VideoDto) {
    const video = await this.resolveVideo(org, body);

    // The two-phase flow is optional on the provider interface, so a provider
    // that only implements process() must be refused cleanly rather than
    // crashing on an undefined method.
    if (!video.instance.plan || !video.instance.create) {
      throw new HttpException(
        `${body.type} does not support reviewing a script before rendering`,
        400
      );
    }

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
   * as they happen, so the response carries real progress for the whole render.
   *
   * `useCredit` takes a callback and `yield` cannot cross a callback boundary,
   * so the render pushes onto a queue that this generator drains concurrently.
   * The credit row is still held for the entire render and still deleted if it
   * throws — collecting into an array and re-yielding afterwards would have
   * been simpler, but nothing would reach the client until the render was over.
   *
   * `video` comes from an already-awaited resolveTwoPhaseVideo, so everything
   * that can fail with a meaningful status has failed before the stream opened.
   */
  async *createVideo(
    org: Organization,
    body: CreateVideoDto,
    video: NonNullable<ReturnType<VideoManager['getVideoByName']>>
  ) {
    const queue: any[] = [];
    let wake: (() => void) | null = null;
    const poke = () => {
      const resume = wake;
      wake = null;
      resume?.();
    };

    let finished = false;
    let failure: unknown;
    let saved: any;
    let render: AsyncGenerator<any> | undefined;

    const work = this._subscriptionService
      .useCredit(org, 'ai_videos', async () => {
        render = video.instance.create!(
          body.output,
          body.storyboard,
          body.customParams
        );

        let url = '';
        for await (const event of render) {
          if (event.name === 'done') {
            url = event.url;
          } else {
            queue.push(event);
            poke();
          }
        }

        if (!url) {
          throw new Error('Video generation produced no output');
        }

        const file = await this.storage.uploadSimple(url);
        return this.saveFile(org.id, file.split('/').pop(), file);
      })
      .then((result) => {
        saved = result;
      })
      .catch((err) => {
        failure = err;
      })
      .finally(() => {
        finished = true;
        poke();
      });

    try {
      while (!finished || queue.length) {
        if (queue.length) {
          yield queue.shift();
          continue;
        }
        // Nothing buffered and the render is still going: sleep until it either
        // produces an event or completes. `wake` is assigned synchronously with
        // the emptiness check, so an event cannot slip in unnoticed between.
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      // The consumer stopped early — a client disconnect. Close the provider's
      // generator so the render stops rather than finishing on a credit nobody
      // is waiting for; `useCredit` then refunds it, because an unfinished
      // render throws. Note this only takes effect at the provider's next
      // yield: an async generator parked on an await cannot be interrupted.
      await render?.return(undefined).catch(() => undefined);
      await work;
    }

    if (failure) {
      // Same normalisation the one-shot route applies, so a provider safety
      // rejection reaches the user as itself rather than as a generic failure.
      throw generationError(failure);
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
