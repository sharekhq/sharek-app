import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  ExposeVideoFunction,
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
import { chunk } from 'lodash';
import Transloadit from 'transloadit';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Readable } from 'stream';
import { parseBuffer } from 'music-metadata';
import { stringifySync } from 'subtitle';

import pLimit from 'p-limit';
import { FalService } from '@gitroom/nestjs-libraries/openai/fal.service';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';
const limit = pLimit(2);

/** ~8s of narration per slide keeps 6 slides near 54s, inside the 60s Shorts ceiling (D14). */
export const WORDS_PER_SLIDE = 20;
/** Hard server-side cost guard (D27): characters in roughly twice the word budget. */
export const MAX_CHARS_PER_SLIDE = 280;
/** Input-token guard on the prompt (D28). */
export const MAX_PROMPT_CHARS = 2000;
/** Stops short cues flashing (D23). */
export const MIN_CUE_SECONDS = 1.5;
/** Silent-slide clamp when voiceover is off (D17). */
export const SILENT_CUE_MIN_SECONDS = 2;
export const SILENT_CUE_MAX_SECONDS = 8;
/** Reading pace for the silent path. */
export const SILENT_CHARS_PER_SECOND = 14;

export const FRAME = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
} as const;

/**
 * Caption styling, calibrated against real Transloadit renders.
 *
 * `fontSize` is not pixels. FFmpeg burns an SRT by converting it to ASS at a
 * fixed PlayRes and scaling that up to the frame, so these numbers sit far
 * below the rendered glyph height. They also differ per script: an Arabic face
 * carries less glyph per em, so Noto Kufi Arabic needs roughly 1.75x Inter's
 * value to read at the same size.
 *
 * `maxCueChars` is the measured two-line ceiling less ~10%. Nothing reached a
 * third line at any tested length, so erring low only means more cues, which
 * paces better anyway.
 */
export const CAPTION = {
  arabic: {
    font: 'Noto Kufi Arabic',
    maxCueChars: 64,
    fontSize: { vertical: 14, horizontal: 18 },
  },
  latin: {
    font: 'Inter',
    maxCueChars: 72,
    fontSize: { vertical: 8, horizontal: 10 },
  },
} as const;

/** Arabic ranges plus the presentation forms; used only to pick a caption face. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export interface CaptionStyle {
  font: string;
  fontSize: number;
  maxCueChars: number;
}

/**
 * Almarai renders a tofu box at every mandatory lam-alef ligature and Amiri is
 * a naskh serif whose line box dominates the frame, so Arabic takes Noto Kufi
 * Arabic. Latin keeps its own face: neither problem applies to it and Inter
 * simply reads better.
 */
export function captionStyleFor(
  text: string,
  output: 'vertical' | 'horizontal'
): CaptionStyle {
  const set = ARABIC_SCRIPT.test(text) ? CAPTION.arabic : CAPTION.latin;
  return {
    font: set.font,
    fontSize: set.fontSize[output],
    maxCueChars: set.maxCueChars,
  };
}

const transloadit = new Transloadit({
  authKey: process.env.TRANSLOADIT_AUTH || 'just empty text',
  authSecret: process.env.TRANSLOADIT_SECRET || 'just empty text',
});

async function getAudioDuration(buffer: Buffer): Promise<number> {
  const metadata = await parseBuffer(buffer, 'audio/mpeg');
  return metadata.format.duration || 0;
}

/**
 * Doubles as the server-side validation contract and Samy's tool schema, so
 * every field carries a description the agent can act on.
 */
export class ImagesSlidesParams {
  @JSONSchema({
    description:
      'What the video should be about. The planner writes the narration from this.',
  })
  @IsString()
  @MaxLength(MAX_PROMPT_CHARS)
  prompt: string;

  @JSONSchema({
    description: 'How many slides the video should have, between 1 and 6.',
  })
  @IsInt()
  @Min(1)
  @Max(6)
  slides: number;

  @JSONSchema({
    description:
      'Whether the video is narrated. When false no voice is generated, the slide text is shown on screen, and no voice id is needed.',
  })
  @IsBoolean()
  voiceover: boolean;

  @JSONSchema({
    description:
      'Elevenlabs voice id, use a special tool to get it. Required only when voiceover is true. If the tool response contains "arabicVoices" and the video content is in Arabic, pick the voice id from "arabicVoices"; otherwise pick from "voices"',
  })
  @ValidateIf((o) => o.voiceover)
  @IsString()
  voice: string;
}

export interface Storyboard {
  styleGuide: string;
  slides: { text: string }[];
}

@Video({
  identifier: 'image-text-slides',
  title: 'Image Text Slides',
  description: 'Generate videos slides from images and text, Don\'t break down the slides, provide only the first slide information',
  placement: 'text-to-image',
  tools: [{ functionName: 'loadVoices', output: 'voice id' }],
  dto: ImagesSlidesParams,
  trial: true,
  available:
    !!process.env.ELEVENSLABS_API_KEY &&
    !!process.env.TRANSLOADIT_AUTH &&
    !!process.env.TRANSLOADIT_SECRET &&
    !!process.env.OPENAI_API_KEY &&
    !!process.env.FAL_KEY,
})
export class ImagesSlides extends VideoAbstract<ImagesSlidesParams> {
  override dto = ImagesSlidesParams;
  private storage = UploadFactory.createStorage();
  constructor(
    private _openaiService: OpenaiService,
    private _falService: FalService
  ) {
    super();
  }

  /**
   * Cheap first phase: text only, no images and no audio. The user reviews and
   * edits the result before anything expensive runs (D8).
   */
  async plan(customParams: ImagesSlidesParams): Promise<Storyboard> {
    const storyboard = await this._openaiService.generateSlidesFromText(
      customParams.prompt,
      {
        slides: customParams.slides,
        wordsPerSlide: WORDS_PER_SLIDE,
      }
    );

    if (!storyboard.slides.length) {
      throw new Error('Could not write a script for this prompt, please try again');
    }

    return storyboard;
  }

  async process(
    output: 'vertical' | 'horizontal',
    customParams: ImagesSlidesParams
  ): Promise<URL> {
    const list = await this._openaiService.generateSlidesFromText(
      customParams.prompt
    );

    const generated = await Promise.all(
      list.reduce((all, current) => {
        all.push(
          new Promise(async (res) => {
            res({
              len: 0,
              url: await this._falService.generateImageFromText(
                'ideogram/v2',
                current.imagePrompt,
                output === 'vertical'
              ),
            });
          })
        );

        all.push(
          new Promise(async (res) => {
            const buffer = Buffer.from(
              await (
                await limit(() =>
                  fetch(
                    `https://api.elevenlabs.io/v1/text-to-speech/${customParams.voice}?output_format=mp3_44100_128`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
                      },
                      body: JSON.stringify({
                        text: current.voiceText,
                        model_id: 'eleven_multilingual_v2',
                      }),
                    }
                  )
                )
              ).arrayBuffer()
            );

            const { path } = await this.storage.uploadFile({
              buffer,
              mimetype: 'audio/mp3',
              size: buffer.length,
              path: '',
              fieldname: '',
              destination: '',
              stream: new Readable(),
              filename: '',
              originalname: '',
              encoding: '',
            });

            res({
              len: await getAudioDuration(buffer),
              url:
                path.indexOf('http') === -1
                  ? process.env.FRONTEND_URL +
                    '/' +
                    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                    path
                  : path,
            });
          })
        );

        return all;
      }, [] as Promise<any>[])
    );

    const split = chunk(generated, 2);

    const srt = stringifySync(
      list
        .reduce((all, current, index) => {
          const start = all.length ? all[all.length - 1].end : 0;
          const end = start + split[index][1].len * 1000 + 1000;
          all.push({
            start: start,
            end: end,
            text: current.voiceText,
          });

          return all;
        }, [] as { start: number; end: number; text: string }[])
        .map((item) => ({
          type: 'cue',
          data: item,
        })),
      { format: 'SRT' }
    );

    console.log(split);

    const { results } = await transloadit.createAssembly({
      uploads: {
        'subtitles.srt': srt,
      },
      waitForCompletion: true,
      params: {
        steps: {
          ...split.reduce((all, current, index) => {
            all[`image${index}`] = {
              robot: '/http/import',
              url: current[0].url,
            };
            all[`audio${index}`] = {
              robot: '/http/import',
              url: current[1].url,
            };
            all[`merge${index}`] = {
              use: [
                {
                  name: `image${index}`,
                  as: 'image',
                },
                {
                  name: `audio${index}`,
                  as: 'audio',
                },
              ],
              robot: '/video/merge',
              duration: current[1].len + 1,
              audio_delay: 0.5,
              preset: 'hls-1080p',
              resize_strategy: 'min_fit',
              loop: true,
            };
            return all;
          }, {} as any),
          concatenated: {
            robot: '/video/concat',
            result: false,
            video_fade_seconds: 0.5,
            use: split.map((p, index) => ({
              name: `merge${index}`,
              as: `video_${index + 1}`,
            })),
          },
          subtitled: {
            robot: '/video/subtitle',
            result: true,
            preset: 'hls-1080p',
            use: {
              bundle_steps: true,
              steps: [
                {
                  name: 'concatenated',
                  as: 'video',
                },
                {
                  name: ':original',
                  as: 'subtitles',
                },
              ],
            },
            position: 'center',
            font_size: 8,
            subtitles_type: 'burned',
          },
        },
      },
    });

    return results.subtitled[0].url;
  }

  @ExposeVideoFunction()
  async loadVoices(data: any) {
    const { voices } = await (
      await fetch(
        'https://api.elevenlabs.io/v2/voices?page_size=40&category=premade',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
          },
        }
      )
    ).json();

    return {
      voices: voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        preview_url: voice.preview_url,
      })),
      ...(await this.loadArabicVoices()),
    };
  }

  private async loadArabicVoices(): Promise<{
    arabicVoices?: { id: string; name: string; preview_url: string }[];
  }> {
    const collectionId = process.env.ELEVENLABS_AR_COLLECTION_ID;
    if (!collectionId) {
      return {};
    }

    // A throwing video function 400s the whole agent chat thread — degrade to
    // the premade-only payload on any failure instead.
    try {
      const { voices } = await (
        await fetch(
          `https://api.elevenlabs.io/v2/voices?page_size=100&collection_id=${collectionId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
            },
          }
        )
      ).json();

      if (!voices?.length) {
        return {};
      }

      return {
        arabicVoices: voices.map((voice: any) => ({
          id: voice.voice_id,
          name: voice.name,
          preview_url: voice.preview_url,
        })),
      };
    } catch (err) {
      return {};
    }
  }
}
