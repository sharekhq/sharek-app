import {
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HttpException } from '@nestjs/common';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { isSafetyRejection } from '@gitroom/nestjs-libraries/openai/generation.error';

class Image {
  @IsString()
  id: string;

  @IsString()
  path: string;
}
class Veo3Params {
  @IsString()
  prompt: string;

  // The reference images are optional — the UI submits no `images` key when
  // none are picked, and process() already maps a missing list to [].
  @IsOptional()
  @Type(() => Image)
  @ValidateNested({ each: true })
  @IsArray()
  @ArrayMaxSize(3)
  images: Image[];

  // Optional like `images` — an older client submits no `audio` key, and the
  // hygiene pass defaults it to ambient.
  @IsOptional()
  @IsIn(['none', 'ambient', 'narration'])
  audio: 'none' | 'ambient' | 'narration';
}

// kie.ai occasionally leaves a task pending forever; without a ceiling the
// streamed response would keep heartbeating indefinitely.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Appended to every outgoing prompt. Veo3 fills implied signage (billboards,
 * stage screens, festival arches) with garbled glyph textures — Arabic script
 * worst of all — and kie.ai exposes no negative-prompt control, so the prompt
 * text is the only lever.
 */
export const VEO3_NO_TEXT_DIRECTIVE =
  'Do not render any readable text, words, letters, numbers, logos, captions or subtitles anywhere in the scene, in any script or language; billboards, screens, banners and signage show only abstract shapes, patterns or light.';

const withNoTextDirective = (prompt: string) =>
  `${prompt}. ${VEO3_NO_TEXT_DIRECTIVE}`;

@Video({
  identifier: 'veo3',
  title: 'Veo3 (Audio + Video)',
  description: 'Generate videos with the most advanced video model.',
  placement: 'text-to-image',
  dto: Veo3Params,
  tools: [],
  trial: false,
  available: !!process.env.KIEAI_API_KEY,
})
export class Veo3 extends VideoAbstract<Veo3Params> {
  constructor(private _openaiService: OpenaiService) {
    super();
  }

  override dto = Veo3Params;
  async process(
    output: 'vertical' | 'horizontal',
    customParams: Veo3Params
  ): Promise<URL> {
    const imageUrls = customParams?.images?.map((p) => p.path) || [];
    // English hygiene pass first — Veo follows English far better than Arabic
    // and otherwise letters garbled glyphs onto every implied sign. Empty means
    // the rewrite failed; the raw prompt still ships with the directive.
    const rewritten = await this._openaiService.generateVideoPrompt(
      customParams.prompt,
      customParams.audio || 'ambient',
      output
    );
    const base = rewritten || customParams.prompt;
    try {
      return await this.render(withNoTextDirective(base), output, imageUrls);
    } catch (err) {
      if (!isSafetyRejection(err)) {
        throw err;
      }
      // Same recovery the slides pipeline gives a flagged slide: one sanitized
      // rewrite, one more render, then give up naming the cause.
      console.log('veo3 prompt flagged:', err);
      const sanitized = await this._openaiService.rewriteFlaggedPrompt(base);
      if (!sanitized) {
        throw err;
      }
      try {
        return await this.render(
          withNoTextDirective(sanitized),
          output,
          imageUrls
        );
      } catch (retryErr) {
        if (!isSafetyRejection(retryErr)) {
          throw retryErr;
        }
        console.log('veo3 sanitized prompt still flagged:', retryErr);
        throw new HttpException(
          'The video was rejected by the AI safety system even after a rewrite. Please reword your prompt and try again.',
          422
        );
      }
    }
  }

  private async render(
    prompt: string,
    output: 'vertical' | 'horizontal',
    imageUrls: string[]
  ): Promise<URL> {
    // The only record of what the rewrite actually produced — without it a
    // video that ignored the user's intent can only be diagnosed by rendering
    // it again.
    console.log('veo3 prompt:', prompt);
    const value = await (
      await fetch('https://api.kie.ai/api/v1/veo/generate', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.KIEAI_API_KEY}`,
        },
        method: 'POST',
        body: JSON.stringify({
          prompt,
          imageUrls,
          model: 'veo3_fast',
          aspectRatio: output === 'horizontal' ? '16:9' : '9:16',
        }),
      })
    ).json();

    if (value.code !== 200 && value.code !== 201) {
      // The body says which call failed and why; the user-facing message stays
      // curated because kie.ai's msg is developer text.
      console.error('veo3 generate failed:', value);
      throw new HttpException(
        'The video render failed to start, please try again.',
        502
      );
    }

    const taskId = value.data.taskId;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let videoUrl = [];
    while (videoUrl.length === 0) {
      if (Date.now() > deadline) {
        // An HttpException, not a plain Error: generationError() passes
        // HttpExceptions through untouched but replaces anything else with a
        // generic 500, which would throw this message away before the user
        // ever sees why the render stopped.
        throw new HttpException(
          'The video render timed out, please try again.',
          504
        );
      }
      console.log('waiting for video to be ready');
      const data = await (
        await fetch(
          'https://api.kie.ai/api/v1/veo/record-info?taskId=' + taskId,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.KIEAI_API_KEY}`,
            },
          }
        )
      ).json();

      if (data.code !== 200 && data.code !== 400) {
        throw new Error(`Failed to get video info`);
      }

      // successFlag: 0 generating, 1 success, 2/3 failed. Without this a failed
      // task polls blind until the 10-minute ceiling and reports a timeout
      // instead of the real reason. errorCode 400 covers content policy and
      // unsupported language — both recoverable by the sanitized English
      // rewrite in process(), so it is thrown in the safety vocabulary that
      // isSafetyRejection() matches.
      const info = data?.data;
      if (info?.successFlag === 2 || info?.successFlag === 3) {
        console.error('veo3 render failed:', info.errorCode, info.errorMessage);
        if (info.errorCode === 400) {
          throw new HttpException(
            'The video was rejected by the AI safety system. Please reword your prompt and try again.',
            422
          );
        }
        throw new HttpException(
          'The video render failed, please try again.',
          502
        );
      }

      videoUrl = info?.response?.resultUrls || [];
      await timer(10000);
    }

    return videoUrl[0];
  }
}
