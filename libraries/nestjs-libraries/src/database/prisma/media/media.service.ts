import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  generationError,
  isSafetyRejection,
} from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import {
  EditImageWithPromptDto,
  GenerateImageWithPromptDto,
} from '@gitroom/nestjs-libraries/dtos/media/generate.image.dto';
import {
  IMAGE_ASPECT_PRESETS,
  IMAGE_REFERENCE_MAX_BYTES,
  IMAGE_STYLES,
  ImageReferenceRefusal,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';
import {
  MediaTooLargeError,
  readOrFetch,
} from '@gitroom/helpers/utils/read.or.fetch';
import sharp from 'sharp';
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
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import { organizationId } from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { MediaProcessorJob } from '@gitroom/nestjs-libraries/upload/media.processor.interface';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  getMaxSize,
  uploadStreamToStorage,
} from '@gitroom/nestjs-libraries/upload/custom.upload.validation';

// What every upload is normalized to before a provider ever sees it. The
// service applies exactly these, so a platform-specific need belongs in the
// provider, not here.
const VIDEO_RULES: MediaProcessorJob['rules'] = {
  short_side_min: 1080,
  short_side_max: 1080,
  long_side_max: 1920,
  video: {
    container: 'mp4',
    video_codec: 'h264',
    profile: 'high',
    pixel_format: 'yuv420p',
    fps_max: 60,
    quality: 23,
    audio_codec: 'aac',
    audio_bitrate_kbps: 128,
    audio_sample_rate: 48000,
    faststart: true,
  },
};
const IMAGE_RULES: MediaProcessorJob['rules'] = {
  short_side_min: 1,
  short_side_max: 1080,
  long_side_max: 1920,
  image: { jpeg_quality: 90, keep_format: true },
};
const LIMITS: MediaProcessorJob['limits'] = {
  max_input_bytes: 1073741824,
  max_duration_seconds: 900,
  timeout_seconds: 1200,
};
// Extension of the normalized file and the content type the presigned PUT is
// minted for; anything else (gif, avif, ...) is stored as uploaded
const PROCESSABLE: Record<
  string,
  { type: 'video' | 'image'; ext: string; contentType: string }
> = {
  '.mp4': { type: 'video', ext: 'mp4', contentType: 'video/mp4' },
  '.mov': { type: 'video', ext: 'mp4', contentType: 'video/mp4' },
  '.jpg': { type: 'image', ext: 'jpg', contentType: 'image/jpeg' },
  '.jpeg': { type: 'image', ext: 'jpg', contentType: 'image/jpeg' },
  '.png': { type: 'image', ext: 'png', contentType: 'image/png' },
  '.webp': { type: 'image', ext: 'webp', contentType: 'image/webp' },
};
// Formats a post can carry without normalization; anything else only exists to be converted
const USABLE_AS_IS = new Set([
  '.mp4',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
]);

// A reference is fitted inside this many pixels before it is sent: the
// presets' longest edge. Gate G1 measured the provider charging more input
// tokens for a larger input, so pixels past this would only cost (research
// R6).
const REFERENCE_MAX_EDGE = 1792;

// A reference refused before the render, named by the number on its
// thumbnail so the window can say which one, in its own words (research R13).
const refuseReference = (
  status: 404 | 422,
  code: ImageReferenceRefusal,
  index: number,
  message: string
) => new HttpException({ message, code, index }, status);

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();
  private processor = UploadFactory.createProcessor();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _temporalService: TemporalService
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

  /**
   * The image counterpart of `generateVideoAllowed`. Asked before the composer
   * commits to its generating phase, so a refusal lands instead of a loader
   * that flashes for half a second and is replaced by the limit card.
   *
   * Credits are checked but not spent: the credit belongs to the generation.
   */
  async generateImageAllowed(org: Organization) {
    await this.resolveImage(org);
    return true;
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
   * The AI image modal's pre-flight, the counterpart of `resolveVideo`: awaited
   * before the stream opens, so a refusal is still a status the billing dialog
   * can act on.
   *
   * The client sends a size preset id and the pixels are resolved here, so a
   * tampered client cannot ask for an arbitrary render, and the exact
   * dimensions the size tooltips promise are the ones the renderer is given.
   */
  async resolveImageWithPrompt(
    org: Organization,
    dto: GenerateImageWithPromptDto
  ) {
    await this.resolveImage(org);
    return {
      size: IMAGE_ASPECT_PRESETS[dto.aspectRatio].size,
      inputs: await this.loadReferences(org, dto.references || []),
    };
  }

  /**
   * The references as the provider receives them, in the order the user
   * numbered them. Everything a reference can be refused for is found here,
   * before the stream opens and before a credit exists, and the refusal
   * carries the number on its thumbnail (`index`): an id this organization's
   * library does not hold, a file over the bound, a format sharp cannot read.
   *
   * One at a time, so no more than one original is in memory at once. Each is
   * turned upright, fitted inside REFERENCE_MAX_EDGE and re-encoded, PNG when
   * it has transparency (a logo keeps it) and JPEG otherwise (research R6).
   */
  private async loadReferences(org: Organization, ids: string[]) {
    const inputs: Parameters<OpenaiService['editImageAtSize']>[2] = [];
    if (!ids.length) {
      return inputs;
    }

    const rows = await this._mediaRepository.getMediaByIds(org.id, ids);
    const paths = ids.map((id) => rows.find((row) => row.id === id)?.path);
    const missing = paths.findIndex((path) => !path);
    if (missing !== -1) {
      throw refuseReference(
        404,
        'reference_missing',
        missing + 1,
        `Reference image ${missing + 1} is no longer in your Media library.`
      );
    }

    for (const [position, path] of paths.entries()) {
      const index = position + 1;

      let original: Buffer;
      try {
        original = await readOrFetch(path!, IMAGE_REFERENCE_MAX_BYTES);
      } catch (err) {
        if (!(err instanceof MediaTooLargeError)) {
          throw err;
        }
        throw refuseReference(
          422,
          'reference_too_large',
          index,
          `Reference image ${index} is larger than ${
            IMAGE_REFERENCE_MAX_BYTES / (1024 * 1024)
          } MB.`
        );
      }

      try {
        const image = sharp(original).rotate().resize({
          width: REFERENCE_MAX_EDGE,
          height: REFERENCE_MAX_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        });
        const { hasAlpha } = await image.metadata();
        inputs.push({
          data: await (hasAlpha
            ? image.png()
            : image.jpeg({ quality: 90 })
          ).toBuffer(),
          mime: hasAlpha ? 'image/png' : 'image/jpeg',
        });
      } catch {
        throw refuseReference(
          422,
          'reference_unreadable',
          index,
          `Reference image ${index} can't be used: its file format isn't supported.`
        );
      }
    }

    return inputs;
  }

  /**
   * The AI image modal's render as a stream, shaped like `processVideo`: the
   * single frame is the terminal one, and the controller's heartbeat wrapper
   * supplies the keep-alives in between. The render cannot be cancelled
   * mid-flight, so a client that disconnects still gets the finished image in
   * the media library, on the credit that was already committed.
   */
  async *generateImageWithPrompt(
    org: Organization,
    dto: GenerateImageWithPromptDto,
    prepared: Awaited<ReturnType<MediaService['resolveImageWithPrompt']>>
  ) {
    // The wire carries a style id; the phrase behind it is resolved here so the
    // client cannot hand the model instructions of its own.
    const style = IMAGE_STYLES.find((entry) => entry.id === dto.style)?.prompt;

    let saved;
    try {
      saved = await this.renderImage(
        org,
        prepared,
        // The enhancement yields '' when the model refuses. Sending that on
        // asks the renderer for an empty prompt — an invalid-parameter 400 the
        // user reads as a generic failure — so fall back to their own words,
        // as the video providers do.
        async () =>
          (await this._openAi.generatePromptForPicture(
            dto.prompt,
            style,
            prepared.inputs.length
          )) || dto.prompt
      );
    } catch (err) {
      throw generationError(err);
    }

    yield { name: 'done', media: saved };
  }

  /**
   * The edit's pre-flight, the counterpart of `resolveImageWithPrompt`: the
   * credit check, then the image on screen as image 1 and the images added to
   * the edit after it, each refused by the number on its thumbnail. The size is
   * the preset that version was made at, resolved here as a generation's is.
   */
  async resolveImageEdit(org: Organization, dto: EditImageWithPromptDto) {
    await this.resolveImage(org);

    // The window shows the edited image as image 1 and never offers it as a
    // reference too, so a request that names it twice is not one it sent.
    if (dto.references?.includes(dto.imageId)) {
      throw new HttpException(
        'The image being edited cannot also be a reference.',
        400
      );
    }

    return {
      size: IMAGE_ASPECT_PRESETS[dto.aspectRatio].size,
      inputs: await this.loadReferences(org, [
        dto.imageId,
        ...(dto.references || []),
      ]),
    };
  }

  /**
   * The edit as a stream, shaped like `generateImageWithPrompt`: the same
   * render, credit and save, with the change improved as a change rather than
   * as a scene. An edit takes no style.
   */
  async *editImageWithPrompt(
    org: Organization,
    dto: EditImageWithPromptDto,
    prepared: Awaited<ReturnType<MediaService['resolveImageEdit']>>
  ) {
    let saved;
    try {
      saved = await this.renderImage(
        org,
        prepared,
        // '' when the model refuses: the user's own words then, as for a
        // generation.
        async () =>
          (await this._openAi.generateEditPrompt(
            dto.prompt,
            prepared.inputs.length
          )) || dto.prompt
      );
    } catch (err) {
      throw generationError(err);
    }

    yield { name: 'done', media: saved };
  }

  /**
   * Everything — the prompt improvement, the flagged-prompt retry, the upload
   * and the save — sits inside the credit callback: charge-on-success means a
   * generation that never happens must never reach the renderer either, a
   * generation that only succeeded on the second attempt still costs exactly
   * one credit, and a spent credit always leaves an image in Media.
   */
  private renderImage(
    org: Organization,
    prepared: Awaited<ReturnType<MediaService['resolveImageWithPrompt']>>,
    improve: () => Promise<string>
  ) {
    return this._subscriptionService.useCredit(org, 'ai_images', async () => {
      const prompt = await improve();
      // Images (references, or the image being edited) go through the edit
      // call; without them the render is the plain call it has always been.
      const render = (text: string) =>
        prepared.inputs.length
          ? this._openAi.editImageAtSize(text, prepared.size, prepared.inputs)
          : this._openAi.generateImageAtSize(text, prepared.size);

      let image: Buffer;
      try {
        image = await render(prompt);
      } catch (err) {
        // Same recovery the slides renderer uses: a content flag is worth one
        // sanitized retry, an ordinary failure is not. A second flag falls
        // through to generationError's 422 with its categories.
        if (!isSafetyRejection(err)) {
          throw err;
        }

        const rewritten = await this._openAi.rewriteFlaggedPrompt(prompt);
        if (!rewritten) {
          throw err;
        }

        image = await render(rewritten);
      }

      const file = await this.storage.uploadSimple(
        'data:image/jpeg;base64,' + image.toString('base64')
      );
      return this.saveFile(org.id, file.split('/').pop(), file);
    });
  }

  // Streams the remote body straight into storage: only the sniffing prefix
  // and a few upload parts are ever in memory, so a 1 GB video does not cost
  // 1 GB of heap
  async uploadFromUrl(org: string, url: string) {
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });
    } catch (err) {
      // Network-level failure (DNS, connection refused, SSRF block, etc.) —
      // fetch rejects rather than returning a non-ok response. Keep the real
      // reason reachable for callers that want to surface it
      throw new BadRequestException('Failed to fetch URL', { cause: err });
    }
    if (!response.ok || !response.body) {
      throw new BadRequestException('Failed to fetch URL');
    }

    // Cheap early exit when the server declares the size; Content-Length may
    // be absent or wrong, so the stream cap below is what really enforces it.
    // The type isn't known yet (sniffed below), so this uses the largest cap
    const declaredSize = Number(response.headers.get('content-length'));
    if (declaredSize && declaredSize > getMaxSize('video/mp4')) {
      await response.body.cancel();
      throw new BadRequestException('File is too large.');
    }

    const uploaded = await uploadStreamToStorage(
      this.storage,
      response.body,
      declaredSize
    );
    return this.saveFile(org, uploaded.originalname, uploaded.path);
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName
    );
  }

  // Saves an upload and, when a normalizer is configured, hands it to the
  // processing workflow; the caller polls getMediaStatus until it is ready
  async saveUploadedFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string
  ) {
    const media = await this.saveFile(org, fileName, filePath, originalName);
    const client = this._temporalService.client.getRawClient();
    if (
      !this.processor ||
      !PROCESSABLE[extname(fileName).toLowerCase()] ||
      !client
    ) {
      return media;
    }

    await this._mediaRepository.startProcessing(org, media.id);
    try {
      await client.workflow.start('processMediaWorkflow', {
        workflowId: `media_${media.id}`,
        taskQueue: 'main',
        args: [{ mediaId: media.id }],
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: organizationId,
            value: org,
          },
        ]),
      });
    } catch (err) {
      // no workflow means nothing will ever flip the status
      return this.releaseUnprocessed(org, media.id, media.name);
    }

    return { ...media, status: 'processing' };
  }

  // Lets go of a media the normalizer will not touch. A source the platforms
  // accept as-is (mp4, png, ...) becomes ready; one that only exists to be
  // converted (mov) is failed, since nothing downstream can use it
  private async releaseUnprocessed(org: string, id: string, name: string) {
    const convertOnly = !USABLE_AS_IS.has(extname(name).toLowerCase());
    await this._mediaRepository.finishProcessing(org, id, {
      ...(convertOnly
        ? { error: 'No media processor is available to convert this file' }
        : {}),
    });
    return this._mediaRepository.getMediaStatus(org, id);
  }

  // Upload widget (MCP Apps): the session id is what the model sees and polls,
  // the ticket is the credential the widget uploads with. It is handed to the
  // widget only, so it doesn't end up in the conversation
  async createUploadSession(org: string) {
    const sessionId = randomBytes(16).toString('hex');
    await ioRedis.set(`uploadSession:${sessionId}`, org, 'EX', 3600);
    return sessionId;
  }

  private async checkUploadSession(org: string, sessionId: string) {
    if ((await ioRedis.get(`uploadSession:${sessionId}`)) !== org) {
      throw new HttpException('Upload session not found or expired', 404);
    }
  }

  async createUploadTicket(org: string, sessionId: string) {
    await this.checkUploadSession(org, sessionId);
    const ticket = randomBytes(32).toString('hex');
    await ioRedis.set(
      `uploadTicket:${ticket}`,
      JSON.stringify({ org, sessionId }),
      'EX',
      600
    );
    return ticket;
  }

  // A ticket never outlives its session: the file is streamed to storage right
  // after this check, so an expired session has to be refused here
  async getUploadTicket(ticket: string) {
    const found = JSON.parse(
      (await ioRedis.get(`uploadTicket:${ticket}`)) || 'null'
    ) as { org: string; sessionId: string } | null;
    if (
      !found ||
      (await ioRedis.get(`uploadSession:${found.sessionId}`)) !== found.org
    ) {
      return null;
    }
    return found;
  }

  async saveUploadSessionFile(
    org: string,
    sessionId: string,
    fileName: string,
    filePath: string,
    originalName?: string
  ) {
    await this.checkUploadSession(org, sessionId);
    const media = await this.saveUploadedFile(
      org,
      fileName,
      filePath,
      originalName
    );
    // a list, so parallel uploads of the same session can't overwrite each other
    await ioRedis.rpush(`uploadSessionMedia:${sessionId}`, media.id);
    await ioRedis.expire(`uploadSessionMedia:${sessionId}`, 3600);
    return media;
  }

  async getUploadSession(org: string, sessionId: string) {
    await this.checkUploadSession(org, sessionId);
    const list = await ioRedis.lrange(`uploadSessionMedia:${sessionId}`, 0, -1);
    return (
      await Promise.all(
        list.map((id) => this._mediaRepository.getMediaStatus(org, id))
      )
    ).filter((f) => f);
  }

  async getMediaStatus(org: string, id: string) {
    const media = await this._mediaRepository.getMediaStatus(org, id);
    if (!media) {
      throw new HttpException('Media not found', 404);
    }

    return media;
  }

  // The normalized file overwrites the original in place; only a container
  // change (mov -> mp4, jpeg -> jpg) lands under a new key. Either way the
  // polling side needs nothing but the media record to know where it is
  private normalizedName(name: string) {
    const ext = extname(name).toLowerCase();
    return `${name.slice(0, -ext.length)}.${PROCESSABLE[ext].ext}`;
  }

  // Returns the processor job id; when this process has nothing to run the
  // media (already marked processing by the upload) is released as ready, so
  // a worker without the processor configured never leaves an upload hanging
  async submitProcessing(mediaId: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media) {
      return null;
    }

    const processable = PROCESSABLE[extname(media.name).toLowerCase()];
    if (
      !this.processor ||
      !processable ||
      !this.storage.signDownloadUrl ||
      !this.storage.signUploadUrl
    ) {
      await this.releaseUnprocessed(media.organizationId, media.id, media.name);
      return null;
    }

    const outputName = this.normalizedName(media.name);
    return this.processor.submit({
      version: 1,
      type: processable.type,
      reference: media.id,
      source: { url: await this.storage.signDownloadUrl(media.name) },
      output: {
        url: await this.storage.signUploadUrl(
          outputName,
          processable.contentType
        ),
        content_type: processable.contentType,
      },
      rules: processable.type === 'video' ? VIDEO_RULES : IMAGE_RULES,
      limits: LIMITS,
    });
  }

  // Returns true once the record is final. A transport error throws so the
  // activity retries the poll; a terminal answer from the queue or the service
  // marks the media failed and keeps the original usable
  async checkProcessing(mediaId: string, jobId: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media) {
      return true;
    }

    // a retried activity after the record was already finalized must not
    // derive the output key a second time from the rewritten name
    if (media.status !== 'processing') {
      return true;
    }

    const org = media.organizationId;
    if (!this.processor) {
      await this.releaseUnprocessed(org, mediaId, media.name);
      return true;
    }

    const job = await this.processor.status(jobId);
    if (job.status === 'pending') {
      return false;
    }

    if (job.status === 'failed') {
      await this._mediaRepository.finishProcessing(org, mediaId, {
        error: job.error,
      });
      return true;
    }

    const { result } = job;
    if (
      !result ||
      !['completed', 'unchanged', 'failed'].includes(result.status)
    ) {
      await this._mediaRepository.finishProcessing(org, mediaId, {
        error: `Unexpected processor result: ${JSON.stringify(result).slice(
          0,
          500
        )}`,
      });
      return true;
    }

    if (result.status === 'failed') {
      // the stderr tail is the only way to know what ffmpeg objected to
      await this._mediaRepository.finishProcessing(org, mediaId, {
        error: [
          `${result.failure?.code || 'FAILED'}: ${
            result.failure?.message || ''
          }`,
          result.failure?.stderr_tail,
        ]
          .filter(Boolean)
          .join('\n')
          .slice(0, 4000),
      });
      return true;
    }

    if (result.status === 'unchanged') {
      await this._mediaRepository.finishProcessing(org, mediaId, {});
      return true;
    }

    const outputName = this.normalizedName(media.name);
    await this._mediaRepository.finishProcessing(org, mediaId, {
      name: outputName,
      path: media.path.slice(0, media.path.lastIndexOf('/') + 1) + outputName,
      fileSize: result.output?.bytes,
    });

    // a same-key output already replaced the original; a stray object after a
    // container change is harmless, so a failed delete never fails the media
    if (outputName !== media.name) {
      try {
        await this.storage.removeFile(media.name);
      } catch (err) {
        console.error(`Could not remove original media ${media.name}:`, err);
      }
    }
    return true;
  }

  async failProcessing(mediaId: string, error: string) {
    const media = await this._mediaRepository.getMediaById(mediaId);
    if (!media) {
      return;
    }

    return this._mediaRepository.finishProcessing(
      media.organizationId,
      mediaId,
      {
        error,
      }
    );
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

  async startGenerateVideo(org: Organization, body: VideoDto) {
    // validated here as well as in the workflow so bad input fails before a job exists
    try {
      await this.resolveVideo(org, body);
    } catch (err) {
      throw generationError(err);
    }

    const client = this._temporalService.client.getRawClient();
    if (!client) {
      throw new HttpException('Video generation is not available', 503);
    }

    const jobId = `video_${org.id}_${makeId(10)}`;
    await client.workflow.start('generateVideoWorkflow', {
      workflowId: jobId,
      taskQueue: 'main',
      args: [
        {
          organizationId: org.id,
          body,
        },
      ],
      typedSearchAttributes: new TypedSearchAttributes([
        {
          key: organizationId,
          value: org.id,
        },
      ]),
    });

    return { jobId };
  }

  async getGenerateVideoStatus(
    org: Organization,
    jobId: string
  ): Promise<{
    status: 'pending' | 'completed' | 'failed';
    id?: string;
    path?: string;
    error?: string;
  }> {
    // the job id carries the organization, so one org can't poll another's job
    if (!jobId.startsWith(`video_${org.id}_`)) {
      throw new HttpException('Video job not found', 404);
    }

    const handle = await this._temporalService.client.getWorkflowHandle(jobId);
    let status: string;
    try {
      status = (await handle.describe()).status.name;
    } catch (err) {
      throw new HttpException('Video job not found', 404);
    }

    if (status === 'RUNNING') {
      return { status: 'pending' };
    }

    try {
      const media = (await handle.result()) as Awaited<
        ReturnType<MediaService['saveFile']>
      >;
      return { status: 'completed', id: media.id, path: media.path };
    } catch (err) {
      // the workflow failure wraps the activity failure which wraps the actual error
      let cause: any = err;
      while (cause?.cause && cause.cause !== cause) {
        cause = cause.cause;
      }
      return {
        status: 'failed',
        error: cause?.message || String(err),
      };
    }
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
