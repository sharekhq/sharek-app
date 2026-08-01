import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import type { ImageGenerateParams } from 'openai/resources/images';
import { shuffle } from 'lodash';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-proj-',
});

const PicturePrompt = z.object({
  prompt: z.string(),
});

const VoicePrompt = z.object({
  voice: z.string(),
});

// The aspect ratio reaches Veo as an API field, but the rewrite never saw it —
// so it wrote wide establishing shots and sweeping camera moves for a frame
// that is taller than it is wide.
const FRAMING_DIRECTIVES = {
  vertical:
    'Compose for a vertical 9:16 frame: a tall upright subject filling the height, the camera close and centred, movement that rises, falls or pushes in rather than panning wide.',
  horizontal:
    'Compose for a horizontal 16:9 frame: the subject set within a wide scene, with room either side and camera movement that travels across it.',
} as const;

// Veo has no audio parameter — the soundtrack is whatever the prompt implies,
// so the user's choice has to be spelled out in words.
const AUDIO_DIRECTIVES = {
  none: 'The video has no spoken words and no music — only quiet natural ambience.',
  ambient:
    'The video has no spoken words: only natural ambient sound and music that suit the scene.',
  narration:
    'The video has a spoken voiceover describing the scene, and no on-screen speaker.',
} as const;

@Injectable()
export class OpenaiService {
  async generateImage(prompt: string, isVertical = false) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3.
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'gpt-image-2',
        size: isVertical ? '1024x1536' : '1024x1024',
        // unset quality defaults to auto → high, ~4x the cost of medium;
        // social platforms recompress uploads, so medium is indistinguishable in-feed
        quality: 'medium',
      })
    ).data[0];

    return generate.b64_json;
  }

  /**
   * Frame-native renders for video slides: gpt-image-2 accepts arbitrary
   * WIDTHxHEIGHT (both edges divisible by 16), so the video frame is requested
   * directly. moderation 'low' keeps benign scenes from tripping the default
   * filter, and jpeg keeps a ~2MP payload small for the storage hop.
   */
  async generateImageAtSize(prompt: string, size: string): Promise<Buffer> {
    const response = await openai.images.generate({
      prompt,
      model: 'gpt-image-2',
      // openai@6.27 types predate gpt-image-2's arbitrary sizes; the API
      // accepts any WIDTHxHEIGHT with both edges divisible by 16.
      size: size as ImageGenerateParams['size'],
      quality: 'medium',
      moderation: 'low',
      output_format: 'jpeg',
    });
    const generate = response.data[0];

    if (!generate?.b64_json) {
      throw new Error(
        `gpt-image-2 returned no image: ${JSON.stringify(response).slice(0, 300)}`
      );
    }

    return Buffer.from(generate.b64_json, 'base64');
  }

  async generatePromptForPicture(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a description and style and generate a prompt that will be used later to generate images, make it a very long and descriptive explanation, and write a lot of things for the renderer like, if it${"'"}s realistic describe the camera`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(PicturePrompt, 'picturePrompt'),
        })
      ).choices[0].message.parsed?.prompt || ''
    );
  }

  async generateVoiceFromText(prompt: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that takes a social media post and convert it to a normal human voice, to be later added to a character, when a person talk they don\'t use "-", and sometimes they add pause with "..." to make it sounds more natural, make sure you use a lot of pauses and make it sound like a real person`,
            },
            {
              role: 'user',
              content: `prompt: ${prompt}`,
            },
          ],
          response_format: zodResponseFormat(VoicePrompt, 'voice'),
        })
      ).choices[0].message.parsed?.voice || ''
    );
  }

  async generatePosts(content: string) {
    const posts = (
      await Promise.all([
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a Twitter post from the content without emojis in the following JSON format: { "post": string } put it in an array with one element',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
        openai.chat.completions.create({
          messages: [
            {
              role: 'assistant',
              content:
                'Generate a thread for social media in the following JSON format: Array<{ "post": string }> without emojis',
            },
            {
              role: 'user',
              content: content!,
            },
          ],
          n: 5,
          temperature: 1,
          model: 'gpt-4.1',
        }),
      ])
    ).flatMap((p) => p.choices);

    return shuffle(
      posts.map((choice) => {
        const { content } = choice.message;
        const start = content?.indexOf('[')!;
        const end = content?.lastIndexOf(']')!;
        try {
          return JSON.parse(
            '[' +
              content
                ?.slice(start + 1, end)
                .replace(/\n/g, ' ')
                .replace(/ {2,}/g, ' ') +
              ']'
          );
        } catch (e) {
          return [];
        }
      })
    );
  }
  async extractWebsiteText(content: string) {
    const websiteContent = await openai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You take a full website text, and extract only the article content',
        },
        {
          role: 'user',
          content,
        },
      ],
      model: 'gpt-4.1',
    });

    const { content: articleContent } = websiteContent.choices[0].message;

    return this.generatePosts(articleContent!);
  }

  async separatePosts(content: string, len: number) {
    const SeparatePostsPrompt = z.object({
      posts: z.array(z.string()),
    });

    const SeparatePostPrompt = z.object({
      post: z.string().max(len),
    });

    const posts =
      (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that take a social media post and break it to a thread, each post must be minimum ${
                len - 10
              } and maximum ${len} characters, keeping the exact wording and break lines, however make sure you split posts based on context`,
            },
            {
              role: 'user',
              content: content,
            },
          ],
          response_format: zodResponseFormat(
            SeparatePostsPrompt,
            'separatePosts'
          ),
        })
      ).choices[0].message.parsed?.posts || [];

    return {
      posts: await Promise.all(
        posts.map(async (post: any) => {
          if (post.length <= len) {
            return post;
          }

          let retries = 4;
          while (retries) {
            try {
              return (
                (
                  await openai.chat.completions.parse({
                    model: 'gpt-5.6-luna',
                    reasoning_effort: 'none',
                    messages: [
                      {
                        role: 'system',
                        content: `You are an assistant that take a social media post and shrink it to be maximum ${len} characters, keeping the exact wording and break lines`,
                      },
                      {
                        role: 'user',
                        content: post,
                      },
                    ],
                    response_format: zodResponseFormat(
                      SeparatePostPrompt,
                      'separatePost'
                    ),
                  })
                ).choices[0].message.parsed?.post || ''
              );
            } catch (e) {
              retries--;
            }
          }

          return post;
        })
      ),
    };
  }

  async generateSlidesFromText(
    text: string,
    options: { slides: number; wordsPerSlide: number }
  ): Promise<{ styleGuide: string; slides: { text: string }[] }> {
    for (let i = 0; i < 3; i++) {
      try {
        const message = `You are an assistant that breaks a text into slides for a narrated video.
First decide the language: the language the user's prompt is mainly written in, unless the prompt explicitly asks for another language. Name it in the language field and write every slide's text in that language.
Produce exactly ${options.slides} slides. Each slide carries only its spoken text, about ${options.wordsPerSlide} words.
Also produce one styleGuide describing how every image in this video should look. The styleGuide is shared by all slides — it is what makes the video look like one piece rather than unrelated stock images.`;

        const parsed = (
          await openai.chat.completions.parse({
            model: 'gpt-5.6-luna',
            // 'low', not 'none': at zero reasoning luna randomly ignored the
            // language rule below (English or Arabic in, Spanish out). Runs
            // once per planned video, so the extra reasoning tokens are noise.
            reasoning_effort: 'low',
            messages: [
              {
                role: 'system',
                content: message,
              },
              {
                role: 'user',
                content: text,
              },
            ],
            response_format: zodResponseFormat(
              z.object({
                // Emitted first — structured outputs write fields in schema
                // order, so the language is resolved into a stated value
                // before any slide text is written against it.
                language: z
                  .string()
                  .describe(
                    "The language the slides will be spoken in: the language the user's prompt is mainly written in, unless the prompt explicitly asks for another language. Name it in English, e.g. 'Arabic'."
                  ),
                styleGuide: z
                  .string()
                  .describe(
                    'One English clause naming a medium, a colour palette, a lighting condition and a camera or rendering treatment, applied to every image in this video. Name no subject and no on-image text.'
                  ),
                slides: z
                  .array(
                    z.object({
                      text: z
                        .string()
                        .describe(
                          'The words spoken on this slide, written in the language named in the language field.'
                        ),
                    })
                  )
                  .describe('an array of slides'),
              }),
              'slides'
            ),
          })
        ).choices[0].message.parsed;

        return {
          styleGuide: parsed?.styleGuide || '',
          // The SDK types every parsed field as optional, so the text is
          // narrowed here rather than asserted; create() drops empty slides.
          slides: (parsed?.slides || []).map((slide) => ({
            text: slide.text || '',
          })),
        };
      } catch (err) {
        console.log(err);
      }
    }

    return { styleGuide: '', slides: [] };
  }

  /**
   * Image prompts are derived from the slide text the user actually approved,
   * not from the planning pass, so an edited or hand-written slide still gets
   * an image that matches what is said on it. The video's topic rides along
   * because spoken lines rarely repeat it — without it, a slide saying only
   * "luxury cars for visitors" renders as a scene from nowhere in particular.
   */
  async generateImagePromptsForSlides(
    slideTexts: string[],
    styleGuide: string,
    topic: string
  ): Promise<string[]> {
    const fallback = () => slideTexts.map((t) => t);

    try {
      const parsed = (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `You write image prompts for the slides of a narrated video.
Return one prompt per slide, in the same order, in English regardless of the slide language.
Describe only the subject of the image. Do not describe style, palette, lighting or camera — those are applied separately. Never ask for text, lettering or writing in the picture.
Keep the proper nouns: when the topic or a slide names a real event, venue, city or landmark, set the scene there by name instead of abstracting it into a generic place.
Write each prompt as one concrete scene: the setting, three or four distinctive visual elements, and a vantage point, with culturally accurate details — never vague crowds in unnamed places.`,
            },
            {
              role: 'user',
              content: [
                `The video's topic: ${topic}`,
                // The style guide is applied to the rendered prompt separately;
                // it is given here so subjects are chosen to suit the palette
                // and medium rather than fighting them.
                `Style the images will be rendered in: ${styleGuide}`,
                ...slideTexts.map((t, i) => `Slide ${i + 1}: ${t}`),
              ].join('\n'),
            },
          ],
          response_format: zodResponseFormat(
            z.object({
              prompts: z
                .array(z.string())
                .describe(
                  'one image prompt per slide, in the same order as the input'
                ),
            }),
            'prompts'
          ),
        })
      ).choices[0].message.parsed;

      if (!parsed?.prompts?.length) {
        return fallback();
      }

      // Pin the length by index — a short or long array would pair images with
      // the wrong slides.
      return slideTexts.map((text, i) => parsed.prompts[i] || text);
    } catch (err) {
      console.log(err);
      return fallback();
    }
  }

  /**
   * Video prompts get the same hygiene as slide image prompts: English out
   * regardless of the input language (video models follow English far better),
   * proper nouns kept, and no readable text anywhere in the scene — video
   * models fill implied signage with garbled glyphs, Arabic script worst of
   * all. Quoted dialogue is the one thing kept verbatim: it is spoken, not
   * rendered, and the user chose its language deliberately. Empty on failure
   * so the caller can fall back to the raw prompt.
   *
   * Shipping English has two side effects the prompt has to undo. Veo reads the
   * spoken language off the prompt text, so an Arabic description came back
   * narrated in English until the language was named outright; and anything it
   * reads as filmic gets letterboxed, which cost 17% of a 9:16 frame to black
   * bars. The clip is a hard 8 seconds, so a multi-shot description ends
   * mid-transition — hence the single-continuous-shot rule.
   *
   * `language` is a schema field rather than an instruction because luna at
   * reasoning_effort 'none' drifts on rules it can satisfy implicitly — the
   * same drift that produced random-language slides. Making it commit to the
   * language first is what holds the narration to it.
   */
  async generateVideoPrompt(
    prompt: string,
    audio: 'none' | 'ambient' | 'narration' = 'ambient',
    output: 'vertical' | 'horizontal' = 'vertical'
  ): Promise<string> {
    try {
      const parsed = (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `You rewrite a user's description into one prompt for an AI video generation model.
Return one prompt, in English regardless of the description's language.
Write one concrete scene: the setting, three or four distinctive visual elements, the camera framing and movement, the lighting, and the ambient sound or music, with culturally accurate details — never vague crowds in unnamed places.
Keep the proper nouns: when the description names a real event, venue, city or landmark, set the scene there by name instead of abstracting it into a generic place.
Keep quoted dialogue exactly as written, in its original language, described as spoken lines.
First identify the language the user wrote in. Any spoken audio must be in that language — name it explicitly, for example "the narrator speaks in Arabic".
${AUDIO_DIRECTIVES[audio]}
Describe a single continuous shot: no cuts, no scene changes, no transitions, and an action that resolves within eight seconds.
${FRAMING_DIRECTIVES[output]}
The scene must fill the entire frame edge to edge — never describe it as cinematic, widescreen or letterboxed, and never mention black bars or film borders.
When the description refers to an attached or reference image, keep that reference intact.
Never ask for readable text: no words, letters, numbers, logos, captions or subtitles anywhere in the scene — billboards, screens, banners and signs show only abstract shapes, patterns or light.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: zodResponseFormat(
            z.object({
              language: z
                .string()
                .describe('the language the user wrote the description in'),
              prompt: z.string().describe('the rewritten video prompt'),
            }),
            'videoPrompt'
          ),
        })
      ).choices[0].message.parsed;

      return parsed?.prompt || '';
    } catch (err) {
      console.log(err);
      return '';
    }
  }

  /**
   * Recovery path for a provider content flag: generation providers screen prompts
   * before rendering and reject real-person or brand references outright. One
   * rewrite keeps the scene while dropping what checkers reject; empty on
   * failure so the caller can give up cleanly rather than pay for a render
   * that will be flagged again.
   */
  async rewriteFlaggedPrompt(prompt: string): Promise<string> {
    try {
      const parsed = (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'none',
          messages: [
            {
              role: 'system',
              content: `A generation service flagged the user's prompt as violating its content policy.
Rewrite the prompt so it keeps the same scene, mood and composition while removing everything a content checker rejects: names of real people, celebrities or public figures (describe an anonymous person instead), brand names, logos, flags and political references.
Return only the rewritten prompt, in English.`,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: zodResponseFormat(
            z.object({
              prompt: z.string().describe('the rewritten prompt'),
            }),
            'rewrittenPrompt'
          ),
        })
      ).choices[0].message.parsed;

      return parsed?.prompt || '';
    } catch (err) {
      console.log(err);
      return '';
    }
  }
}
