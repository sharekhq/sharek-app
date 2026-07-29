import { Injectable } from '@nestjs/common';

import pLimit from 'p-limit';
const limit = pLimit(10);

@Injectable()
export class FalService {
  /**
   * `endpoint` is a full fal endpoint id (e.g. `ideogram/v4`) — models live
   * under different owner namespaces, so the prefix cannot be assumed.
   * `params` is passed through untouched: the shape differs per model and this
   * service stays free of model-specific knowledge.
   */
  async generateImageFromText(
    endpoint: string,
    prompt: string,
    params: Record<string, unknown> = {}
  ): Promise<string> {
    const { images, video, ...all } = await (
      await limit(() =>
        fetch(`https://fal.run/${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt, ...params }),
        })
      )
    ).json();

    if (video) {
      return video.url;
    }

    if (!images?.[0]?.url) {
      throw new Error(
        `fal ${endpoint} returned no image: ${JSON.stringify(all).slice(0, 300)}`
      );
    }

    // v4 reports the dimensions it actually produced (v2 and v3 do not), which
    // is the only way to confirm in production that we are getting native
    // frame size rather than something Transloadit will upscale.
    console.log(`fal ${endpoint}`, images[0].width, 'x', images[0].height);

    return images[0].url as string;
  }
}
