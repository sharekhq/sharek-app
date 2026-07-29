import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  ExposeVideoFunction,
  URL,
  Video,
  VideoAbstract,
} from '@gitroom/nestjs-libraries/videos/video.interface';
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
import {
  splitIntoCues,
  timeCuesFromAlignment,
  timeCuesByReading,
  TimedCue,
} from './captions';
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

export interface SlideAudio {
  /** Absent when the video is silent. */
  audioUrl?: string;
  seconds: number;
  cues: TimedCue[];
}

export type CreateEvent =
  | { name: 'progress'; step: string; done: number; total: number }
  | { name: 'done'; url: string };

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
    const storyboard = await this.plan(customParams);
    let url = '';
    for await (const event of this.create(output, storyboard, customParams)) {
      if (event.name === 'done') {
        url = event.url;
      }
    }
    if (!url) {
      throw new Error('Video generation produced no output');
    }
    return url;
  }

  /**
   * Second phase. Yields progress so the caller can keep a streamed HTTP
   * response alive across a render that outlives any proxy idle timeout, and
   * finishes with the video URL.
   */
  async *create(
    output: 'vertical' | 'horizontal',
    storyboard: Storyboard,
    customParams: ImagesSlidesParams
  ): AsyncGenerator<CreateEvent> {
    const frame = FRAME[output];
    const texts = storyboard.slides.map((s) => s.text.trim()).filter(Boolean);

    if (!texts.length) {
      throw new Error('This video has no slides');
    }
    // Cost guard, enforced here rather than only in the form (D27).
    const overlong = texts.find((t) => t.length > MAX_CHARS_PER_SLIDE);
    if (overlong) {
      throw new Error(
        `One slide is too long (${overlong.length} characters, limit ${MAX_CHARS_PER_SLIDE})`
      );
    }

    // Font, size and cue length all follow the script the slides are written
    // in, so this is derived once from the text the user approved.
    const caption = captionStyleFor(texts.join(' '), output);

    yield { name: 'progress', step: 'planning', done: 0, total: texts.length };

    const imagePrompts = await this._openaiService.generateImagePromptsForSlides(
      texts,
      storyboard.styleGuide
    );

    yield { name: 'progress', step: 'images', done: 0, total: texts.length };

    // Parallel, as before — six sequential image calls would add a minute to a
    // render already fighting a proxy timeout. The fix for the old hang is the
    // *shape*, not the concurrency: `Promise.all` over real async functions
    // propagates a rejection, whereas the previous `new Promise(async …)` had
    // no reject path and simply never settled.
    const seed = this.seedFor(storyboard);
    const images = await Promise.all(
      texts.map(async (_text, i) =>
        this._falService.generateImageFromText(
          'ideogram/v4',
          `${imagePrompts[i]}. ${storyboard.styleGuide}`,
          {
            image_size: { width: frame.width, height: frame.height },
            rendering_speed: 'BALANCED',
            expansion_model: 'None',
            seed,
          }
        )
      )
    );

    yield { name: 'progress', step: 'images', done: texts.length, total: texts.length };

    const slides = customParams.voiceover
      ? await this.narrate(texts, customParams.voice, caption.maxCueChars)
      : this.silent(texts, caption.maxCueChars);

    yield {
      name: 'progress',
      step: 'assembling',
      done: texts.length,
      total: texts.length,
    };

    const url = await this.assemble(images, slides, caption);
    yield { name: 'done', url };
  }

  /** One seed per video; varies between videos, constant across a deck. */
  private seedFor(storyboard: Storyboard): number {
    let hash = 0;
    for (const ch of storyboard.styleGuide +
      storyboard.slides.map((s) => s.text).join('')) {
      hash = (hash * 31 + ch.charCodeAt(0)) % 2_147_483_647;
    }
    return hash;
  }

  private async narrate(
    texts: string[],
    voice: string,
    maxCueChars: number
  ): Promise<SlideAudio[]> {
    // Parallel with the existing pLimit(2) concurrency cap, for the same reason
    // the images are: sequential TTS would add tens of seconds. `Promise.all`
    // over async functions rejects properly, which the old shape did not.
    return Promise.all(
      texts.map((text) => this.narrateOne(text, voice, maxCueChars))
    );
  }

  private async narrateOne(
    text: string,
    voice: string,
    maxCueChars: number
  ): Promise<SlideAudio> {
    // The timestamps variant returns JSON rather than raw audio, and carries
    // per-character timings so caption boundaries are looked up rather than
    // estimated (D24).
    const response = await limit(() =>
      fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENSLABS_API_KEY || '',
          },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        }
      )
    );

    if (!response.ok) {
      throw new Error(
        `Voice generation failed (${response.status}). Please try again.`
      );
    }

    const payload = await response.json();
    if (!payload?.audio_base64) {
      throw new Error('Voice generation returned no audio');
    }

    const buffer = Buffer.from(payload.audio_base64, 'base64');
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

    // `alignment` follows the original string; `normalized_alignment` times the
    // expanded form ("40%" → "forty percent") and its indices would not map to
    // what is displayed.
    const cues = splitIntoCues(text, maxCueChars);
    return {
      audioUrl:
        path.indexOf('http') === -1
          ? process.env.FRONTEND_URL +
            '/' +
            process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
            path
          : path,
      seconds: await getAudioDuration(buffer),
      cues: payload.alignment
        ? timeCuesFromAlignment(cues, payload.alignment, MIN_CUE_SECONDS)
        : timeCuesByReading(
            cues,
            SILENT_CHARS_PER_SECOND,
            MIN_CUE_SECONDS,
            SILENT_CUE_MAX_SECONDS
          ),
    };
  }

  private silent(texts: string[], maxCueChars: number): SlideAudio[] {
    return texts.map((text) => {
      const cues = timeCuesByReading(
        splitIntoCues(text, maxCueChars),
        SILENT_CHARS_PER_SECOND,
        SILENT_CUE_MIN_SECONDS,
        SILENT_CUE_MAX_SECONDS
      );
      return {
        audioUrl: undefined,
        seconds: cues.length ? cues[cues.length - 1].end : SILENT_CUE_MIN_SECONDS,
        cues,
      };
    });
  }

  private async assemble(
    images: string[],
    slides: SlideAudio[],
    caption: CaptionStyle
  ): Promise<string> {
    // Cue times are per-slide; the SRT needs them on the video's timeline.
    let offset = 0;
    const entries: { start: number; end: number; text: string }[] = [];
    for (const slide of slides) {
      for (const cue of slide.cues) {
        // A cue that trims to nothing would burn an empty caption row.
        if (!cue.text) {
          continue;
        }
        entries.push({
          start: Math.round((offset + cue.start) * 1000),
          end: Math.round((offset + cue.end) * 1000),
          text: cue.text,
        });
      }
      offset += slide.seconds + 1;
    }

    const srt = stringifySync(
      entries.map((data) => ({ type: 'cue', data })),
      { format: 'SRT' }
    );

    const steps: Record<string, any> = {};
    slides.forEach((slide, index) => {
      steps[`image${index}`] = { robot: '/http/import', url: images[index] };
      const use: any[] = [{ name: `image${index}`, as: 'image' }];
      if (slide.audioUrl) {
        steps[`audio${index}`] = { robot: '/http/import', url: slide.audioUrl };
        use.push({ name: `audio${index}`, as: 'audio' });
      }
      steps[`merge${index}`] = {
        use,
        robot: '/video/merge',
        duration: slide.seconds + 1,
        preset: 'hls-1080p',
        resize_strategy: 'min_fit',
        loop: true,
      };
    });

    steps.concatenated = {
      robot: '/video/concat',
      result: false,
      video_fade_seconds: 0.5,
      use: slides.map((_, index) => ({
        name: `merge${index}`,
        as: `video_${index + 1}`,
      })),
    };

    steps.subtitled = {
      robot: '/video/subtitle',
      result: true,
      preset: 'hls-1080p',
      use: {
        bundle_steps: true,
        steps: [
          { name: 'concatenated', as: 'video' },
          { name: ':original', as: 'subtitles' },
        ],
      },
      // The default face has no Arabic coverage, so the renderer fell back to
      // one missing the mandatory lam-alef ligature — a tofu box at every ل+ا
      // pair. Noto Kufi Arabic is the only face that renders it, and an outline
      // keeps the text legible over the image without the slab a box border
      // puts behind every line.
      font: caption.font,
      font_size: caption.fontSize,
      font_color: 'FFFFFF',
      position: 'bottom',
      border_style: 'outline',
      border_color: '00000000',
      subtitles_type: 'burned',
    };

    const { results } = await transloadit.createAssembly({
      uploads: { 'subtitles.srt': srt },
      waitForCompletion: true,
      params: { steps },
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
