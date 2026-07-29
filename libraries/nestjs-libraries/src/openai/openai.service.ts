import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
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
Produce exactly ${options.slides} slides. Each slide carries only its spoken text, about ${options.wordsPerSlide} words, written in the same language as the user's input.
Also produce one styleGuide describing how every image in this video should look. The styleGuide is shared by all slides — it is what makes the video look like one piece rather than unrelated stock images.`;

        const parsed = (
          await openai.chat.completions.parse({
            model: 'gpt-5.6-luna',
            reasoning_effort: 'none',
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
                          "The words spoken on this slide, in the same language as the user's input."
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
   * an image that matches what is said on it.
   */
  async generateImagePromptsForSlides(
    slideTexts: string[],
    styleGuide: string
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
Describe only the subject of the image. Do not describe style, palette, lighting or camera — those are applied separately. Never ask for text, lettering or writing in the picture.`,
            },
            {
              role: 'user',
              content: [
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
}
