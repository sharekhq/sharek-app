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
  override dto = Veo3Params;
  async process(
    output: 'vertical' | 'horizontal',
    customParams: Veo3Params
  ): Promise<URL> {
    const value = await (
      await fetch('https://api.kie.ai/api/v1/veo/generate', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.KIEAI_API_KEY}`,
        },
        method: 'POST',
        body: JSON.stringify({
          prompt: customParams.prompt,
          imageUrls: customParams?.images?.map((p) => p.path) || [],
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
