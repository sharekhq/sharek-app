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
// that is taller than it is wide. These constrain the frame only: an earlier
// version named a subject shape and a camera move, and every render obeyed it
// literally, so a Riyadh street festival and an Egyptian temple came back as
// the same rising shot of a tall central structure.
const FRAMING_DIRECTIVES = {
  vertical:
    'Compose for a vertical 9:16 frame: the subject must read clearly in a tall narrow frame, and the shot must never depend on width to make sense. Let the scene decide the framing and the camera — a quiet moment may want a still close-up, a crowd a slow drift, a performance a locked-off wide.',
  horizontal:
    'Compose for a horizontal 16:9 frame: the subject must read clearly across a wide frame. Let the scene decide the framing and the camera — a quiet moment may want a still close-up, a crowd a slow drift, a performance a locked-off wide.',
} as const;

// Veo has no audio parameter — the soundtrack is whatever the prompt implies,
// so the user's choice has to be spelled out in words.
const AUDIO_DIRECTIVES = {
  none: 'The video has no spoken words and no music — only quiet natural ambience.',
  ambient:
    'The video has no spoken words: only natural ambient sound and music that suit the scene.',
  narration:
    'The video has a spoken voiceover and no on-screen speaker. Write the exact words it says, inside quotation marks, in the spoken language identified above — one or two sentences about the scene itself, never a restatement of the user\'s request.',
} as const;

@Injectable()
export class OpenaiService {
  async generateImage(prompt: string, isVertical = false) {
    // gpt-image models always return base64 (b64_json) and do not accept the
    // `response_format` parameter, unlike the deprecated dall-e-3.
    const generate = (
      await openai.images.generate({
        prompt,
        model: 'gpt-image-2.5-sunburst',
        size: isVertical ? '1024x1536' : '1024x1024',
        // 2.5 re-based its quality labels: `high` is the tier whose render
        // budget and price match what gpt-image-2 `medium` was, so it is the
        // like-for-like pin the pricing ladder assumes. `medium` is a quarter
        // of that budget and `auto` is whatever OpenAI picks — either moves
        // the unit cost.
        quality: 'high',
      })
    ).data[0];

    return generate.b64_json;
  }

  /**
   * Frame-native renders for video slides and the AI image modal: the 2.5
   * models accept arbitrary WIDTHxHEIGHT (both edges divisible by 16, aspect
   * between 1:3 and 3:1), so the exact frame is requested. `high` for the same
   * reason generateImage pins it — it is gpt-image-2 `medium`'s budget under
   * 2.5's re-based labels. moderation 'low' keeps benign scenes from tripping
   * the default filter, and jpeg keeps a ~2MP payload small for the storage hop.
   */
  async generateImageAtSize(prompt: string, size: string): Promise<Buffer> {
    const response = await openai.images.generate({
      prompt,
      model: 'gpt-image-2.5-sunburst',
      // openai@6.27 types predate arbitrary sizes; the API accepts any
      // WIDTHxHEIGHT with both edges divisible by 16.
      size: size as ImageGenerateParams['size'],
      quality: 'high',
      moderation: 'low',
      output_format: 'jpeg',
    });
    const generate = response.data[0];

    if (!generate?.b64_json) {
      throw new Error(
        `gpt-image-2.5-sunburst returned no image: ${JSON.stringify(response).slice(0, 300)}`
      );
    }

    return Buffer.from(generate.b64_json, 'base64');
  }

  /**
   * `style` is the catalog's English phrase for the style the user picked, and
   * it arrives as its own line rather than spliced into the description — the
   * client used to wrap it in HTML comments inside the prompt itself, which
   * left the model to work out which half was the request. Absent for Auto, so
   * the style is inferred from the description instead of imposed.
   *
   * The instruction set is modelled on generateImagePromptsForSlides, with the
   * text rules inverted: slides never carry words by construction, while this
   * modal's core use is a banner whose words the user typed. Upstream's
   * one-line prompt let the rewrite translate «تخفيضات 50%» on its way to the
   * renderer, which ships a real Arabic banner with the wrong words on it.
   *
   * 'low' rather than 'none' for the same reason generateSlidesFromText and
   * generateVideoPrompt buy it back: luna at zero reasoning drops constraints
   * it can satisfy implicitly, and two of these pull against each other — the
   * prompt is written in English while quoted text keeps its own script.
   */
  async generatePromptForPicture(prompt: string, style?: string) {
    return (
      (
        await openai.chat.completions.parse({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'low',
          messages: [
            {
              role: 'system',
              content: `You rewrite a user's description into one prompt for an AI image generation model.
Return one prompt, in English regardless of the description's language.
Write one concrete scene: the setting, three or four distinctive visual elements, a vantage point and the lighting, with culturally accurate details — never vague crowds in unnamed places.
Keep the proper nouns: when the description names a real event, venue, city or landmark, set the scene there by name instead of abstracting it into a generic place.
When the user asks for words to appear in the image, carry those words into the prompt verbatim, inside quotation marks, in their original script and spelling — never translate, transliterate, shorten or correct them — and say where in the scene they appear.
When the user asks for no words, or mentions none, the image must contain no text: no lettering, captions, signage, subtitles, logos or watermarks anywhere in the scene.
A style may be supplied on its own line; apply it to the whole image and let it change how the scene looks, never what it shows. When no style is given, choose the one the description implies.
Describe the medium, the lighting and the camera the scene calls for — for a photographic scene, name the lens and the framing.`,
            },
            {
              role: 'user',
              content: [
                `prompt: ${prompt}`,
                ...(style ? [`Render in this style: ${style}`] : []),
              ].join('\n'),
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
   * `spokenLanguage` is a schema field rather than an instruction because luna
   * at reasoning_effort 'none' drifts on rules it can satisfy implicitly — the
   * same drift that produced random-language slides. It has to name speech
   * explicitly: as a bare `language` field it anchored the whole rewrite, and
   * an Arabic description came back as an Arabic prompt. Paired with 'low'
   * reasoning for the same reason generateSlidesFromText buys it back — ten
   * constraints at once, two of which pull against each other, since the
   * prompt stays English while the speech follows the user's language.
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
          reasoning_effort: 'low',
          messages: [
            {
              role: 'system',
              content: `You rewrite a user's description into one prompt for an AI video generation model.
Return one prompt, in English regardless of the description's language.
Write one concrete scene: the setting, its distinctive visual details, the camera framing and movement, the lighting, and the ambient sound or music, with culturally accurate specifics — never vague crowds in unnamed places.
Keep the proper nouns: when the description names a real event, venue, city or landmark, set the scene there by name instead of abstracting it into a generic place.
Keep quoted dialogue exactly as written, in its original language, described as spoken lines.
Identify the language the user wrote in: any spoken audio must be in that language — name it explicitly, for example "the narrator speaks in Arabic". The prompt itself is still written in English.
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
              spokenLanguage: z
                .string()
                .describe(
                  'the language any spoken audio must use — the language the user wrote the description in'
                ),
              prompt: z
                .string()
                .describe('the rewritten video prompt, written in English'),
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
Keep any quoted text that must appear inside the image exactly as it is written, in its original script — never translate, transliterate or reword it.
Return only the rewritten prompt, written in English apart from that quoted text.`,
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
