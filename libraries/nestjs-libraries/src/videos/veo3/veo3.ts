import {
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HttpException } from '@nestjs/common';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';

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
      customParams.prompt
    );
    const base = rewritten || customParams.prompt;
    return this.render(withNoTextDirective(base), output, imageUrls);
  }

  private async render(
    prompt: string,
    output: 'vertical' | 'horizontal',
    imageUrls: string[]
  ): Promise<URL> {
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
      throw new Error(`Failed to generate video`);
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

      videoUrl = data?.data?.response?.resultUrls || [];
      await timer(10000);
    }

    return videoUrl[0];
  }
}
