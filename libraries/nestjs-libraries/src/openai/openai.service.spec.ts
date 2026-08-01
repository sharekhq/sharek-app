// The service builds its OpenAI client at module scope and never exports it, so
// the only way to see what it sends is to stand in for the SDK. Only the default
// export is mocked — `openai/helpers/zod` stays real, because zodResponseFormat
// is what puts `strict: true` on the schema and that is worth exercising.
const mockParse = jest.fn(async () => ({
  choices: [{ message: { parsed: {} } }],
}));
const mockCreate = jest.fn();
const mockImagesGenerate = jest.fn(async () => ({
  data: [{ b64_json: 'B64' }],
}));
jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = { completions: { parse: mockParse, create: mockCreate } };
    images = { generate: mockImagesGenerate };
  },
}));

import { OpenaiService } from './openai.service';

const service = new OpenaiService();

// Reasoning tokens bill as output and gpt-5.6 defaults to 'medium', so an
// unpinned call costs more than the gpt-4.1 it replaced rather than less. None
// of these calls binds a tool, so 'none' is purely about not buying reasoning.
// generateSlidesFromText is the one exception — it runs at 'low' and is pinned
// in its own describe block below.
describe('OpenaiService model configuration', () => {
  beforeEach(() => mockParse.mockClear());

  const liveCalls: [string, () => Promise<unknown>][] = [
    ['generatePromptForPicture', () => service.generatePromptForPicture('a cat')],
    ['generateVoiceFromText', () => service.generateVoiceFromText('some post')],
    ['separatePosts', () => service.separatePosts('a long post', 280)],
    [
      'generateImagePromptsForSlides',
      () =>
        service.generateImagePromptsForSlides(
          ['one'],
          'warm cinematic',
          'a video about Riyadh Season'
        ),
    ],
    [
      'rewriteFlaggedPrompt',
      () => service.rewriteFlaggedPrompt('a football star on stage'),
    ],
  ];

  it.each(liveCalls)(
    '%s runs gpt-5.6-luna with reasoning off',
    async (_name, call) => {
      await call();
      expect(mockParse).toHaveBeenCalled();
      for (const [params] of mockParse.mock.calls as unknown as [
        { model: string; reasoning_effort: string; temperature?: number }
      ][]) {
        expect(params.model).toBe('gpt-5.6-luna');
        expect(params.reasoning_effort).toBe('none');
        expect(params).not.toHaveProperty('temperature');
      }
    }
  );

  // zodResponseFormat emits strict: true, which is what makes the schema binding
  // enforced at decode time rather than merely suggested. Structured outputs are
  // supported on gpt-5.6, so this survives the model change.
  it('asks for a strict json schema', async () => {
    await service.generateSlidesFromText('a script', {
      slides: 4,
      wordsPerSlide: 20,
    });
    const [params] = mockParse.mock.calls[0] as unknown as [
      { response_format: { type: string; json_schema: { strict: boolean } } }
    ];
    expect(params.response_format.type).toBe('json_schema');
    expect(params.response_format.json_schema.strict).toBe(true);
  });
});

// gpt-image-2 is current and deliberately pinned to medium quality: social
// platforms recompress uploads, so `high` costs roughly 4x for no in-feed gain.
// The model migration must not touch this.
describe('OpenaiService.generateImage', () => {
  beforeEach(() => mockImagesGenerate.mockClear());

  it('stays on gpt-image-2 at medium quality', async () => {
    expect(await service.generateImage('a pomegranate')).toBe('B64');
    expect(mockImagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-2',
        quality: 'medium',
        size: '1024x1024',
      })
    );
  });

  it('switches to a vertical canvas when asked', async () => {
    await service.generateImage('a pomegranate', true);
    expect(mockImagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ size: '1024x1536' })
    );
  });
});

// Slide renders ask for the exact video frame: gpt-image-2 takes arbitrary
// WIDTHxHEIGHT (both divisible by 16), unlike the fixed portrait sizes the
// post-image path uses. moderation stays 'low' — the default filter's false
// positives on benign festival scenes are what killed the ideogram renderer.
describe('OpenaiService.generateImageAtSize', () => {
  beforeEach(() => mockImagesGenerate.mockClear());

  it('renders gpt-image-2 at the requested size in medium quality', async () => {
    await service.generateImageAtSize('a scene', '1088x1920');
    expect(mockImagesGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-2',
        size: '1088x1920',
        quality: 'medium',
        moderation: 'low',
        output_format: 'jpeg',
      })
    );
  });

  it('returns the image as raw bytes', async () => {
    const buffer = await service.generateImageAtSize('a scene', '1920x1088');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.equals(Buffer.from('B64', 'base64'))).toBe(true);
  });

  // A silently empty buffer here surfaces three frames later as a storage
  // driver's "Unsupported file type" — reporting an upstream provider problem
  // as a storage problem. Fail at the source instead, with the response body
  // attached, mirroring FalService's equivalent guard.
  it('throws when the model returns no image', async () => {
    mockImagesGenerate.mockResolvedValueOnce({ data: [{}] });
    await expect(
      service.generateImageAtSize('a scene', '1088x1920')
    ).rejects.toThrow(/returned no image/);
  });
});

// A shared style clause applied to every slide is the mechanism that stops a
// deck looking like four unrelated stock images, so it has to survive as a
// first-class field rather than prose inside each slide's prompt.
describe('OpenaiService.generateSlidesFromText', () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ choices: [{ message: { parsed: {} } }] });
  });

  const schemaOf = () =>
    (mockParse.mock.calls[0][0] as any).response_format.json_schema.schema;

  const systemOf = () => (mockParse.mock.calls[0][0] as any).messages[0].content;

  it('asks for a top-level styleGuide alongside the slides', async () => {
    await service.generateSlidesFromText('a script', {
      slides: 4,
      wordsPerSlide: 20,
    });
    expect(Object.keys(schemaOf().properties)).toEqual(
      expect.arrayContaining(['styleGuide', 'slides'])
    );
  });

  it('does not ask the planner for image prompts', async () => {
    await service.generateSlidesFromText('a script', {
      slides: 4,
      wordsPerSlide: 20,
    });
    expect(Object.keys(schemaOf().properties.slides.items.properties)).toEqual([
      'text',
    ]);
  });

  it('passes the slide count and word budget into the system prompt', async () => {
    await service.generateSlidesFromText('a script', {
      slides: 6,
      wordsPerSlide: 20,
    });
    expect(systemOf()).toContain('6');
    expect(systemOf()).toContain('20');
  });

  // The caption treatment (D21) makes the gradient unnecessary, and asking for
  // it per-slide in prose was applied unevenly across a deck.
  it('no longer asks images for a dark gradient', async () => {
    await service.generateSlidesFromText('a script', {
      slides: 4,
      wordsPerSlide: 20,
    });
    expect(systemOf().toLowerCase()).not.toContain('gradient');
  });

  it('returns an empty storyboard rather than throwing when every attempt fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(
      await service.generateSlidesFromText('a script', {
        slides: 4,
        wordsPerSlide: 20,
      })
    ).toEqual({ styleGuide: '', slides: [] });
  });

  // Language drift fix: at zero reasoning luna randomly botched the relative
  // "same language as the user's input" (English and Arabic prompts both came
  // back Spanish or Hindi). Pinned here: buy back 'low' reasoning, and resolve
  // the language into an explicit field emitted before any slide text.
  describe('output language anchoring', () => {
    const plan = () =>
      service.generateSlidesFromText('a script', {
        slides: 4,
        wordsPerSlide: 20,
      });

    it('runs gpt-5.6-luna with low reasoning', async () => {
      await plan();
      const [params] = mockParse.mock.calls[0] as unknown as [
        { model: string; reasoning_effort: string; temperature?: number }
      ];
      expect(params.model).toBe('gpt-5.6-luna');
      expect(params.reasoning_effort).toBe('low');
      expect(params).not.toHaveProperty('temperature');
    });

    // Structured outputs emit fields in schema property order, so first place
    // is what makes the language a decision the slides can anchor to rather
    // than an afterthought written below them.
    it('asks for the language as the first field of the schema', async () => {
      await plan();
      expect(Object.keys(schemaOf().properties)[0]).toBe('language');
    });

    // "Mainly written in" is what handles mixed-language prompts, and the
    // explicit-request escape is what keeps "make a video in Arabic about X"
    // typed in English working.
    it('derives the language from the prompt, honouring an explicit request', async () => {
      await plan();
      const description = schemaOf().properties.language.description;
      expect(description).toMatch(/mainly/i);
      expect(description).toMatch(/explicitly/i);
    });

    it('ties each slide text to the named language field', async () => {
      await plan();
      expect(
        schemaOf().properties.slides.items.properties.text.description
      ).toMatch(/language field/i);
    });

    // The relative phrasing was the bug — it must not come back.
    it('no longer asks for "the same language as the user\'s input"', async () => {
      await plan();
      const everywhere = JSON.stringify(mockParse.mock.calls[0][0]);
      expect(everywhere).not.toMatch(/same language as/i);
    });
  });
});

describe('OpenaiService.generateImagePromptsForSlides', () => {
  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ choices: [{ message: { parsed: {} } }] });
  });

  it('asks for English prompts describing subject only', async () => {
    mockParse.mockResolvedValue({
      choices: [{ message: { parsed: { prompts: ['a brass tray', 'a lantern'] } } }],
    });
    const prompts = await service.generateImagePromptsForSlides(
      ['أهلاً', 'مرحباً'],
      'warm cinematic',
      'a ramadan offer'
    );
    expect(prompts).toEqual(['a brass tray', 'a lantern']);
  });

  // A short or long array would silently misalign images against slides, so the
  // length is pinned by index rather than trusted.
  it('falls back to the slide text for any prompt the model omitted', async () => {
    mockParse.mockResolvedValue({
      choices: [{ message: { parsed: { prompts: ['a brass tray'] } } }],
    });
    expect(
      await service.generateImagePromptsForSlides(
        ['one', 'two'],
        'warm cinematic',
        'a ramadan offer'
      )
    ).toEqual(['a brass tray', 'two']);
  });

  it('falls back entirely when the call fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(
      await service.generateImagePromptsForSlides(['one', 'two'], 'warm', 't')
    ).toEqual(['one', 'two']);
  });

  // A slide's spoken line often never repeats the video's topic — the deck
  // about Riyadh Season had lines that only said "luxury cars for visitors" —
  // so the writer needs the topic to set every scene in the right place.
  it('passes the video topic to the model', async () => {
    await service.generateImagePromptsForSlides(
      ['one'],
      'warm cinematic',
      'فيديو عن موسم الرياض بالسعودية'
    );
    expect((mockParse.mock.calls[0][0] as any).messages[1].content).toContain(
      'فيديو عن موسم الرياض بالسعودية'
    );
  });

  // Abstracting «موسم الرياض» into "a grand festival" is what made every deck
  // look like anonymous stock footage.
  it('tells the model to keep proper nouns and write concrete scenes', async () => {
    await service.generateImagePromptsForSlides(['one'], 'warm', 't');
    const system = (mockParse.mock.calls[0][0] as any).messages[0].content;
    expect(system).toMatch(/proper nouns/i);
    expect(system).toMatch(/vantage/i);
  });

});

// The recovery path for a provider content flag: keep the scene, drop what the
// checker rejects. Empty on failure so the caller can give up cleanly instead
// of paying for a render that will be flagged again.
describe('OpenaiService.rewriteFlaggedPrompt', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ choices: [{ message: { parsed: {} } }] });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  it('returns the rewritten prompt', async () => {
    mockParse.mockResolvedValue({
      choices: [{ message: { parsed: { prompt: 'an athlete on stage' } } }],
    });
    expect(
      await service.rewriteFlaggedPrompt('a football star on stage')
    ).toBe('an athlete on stage');
  });

  it('sends the flagged prompt as the user message', async () => {
    await service.rewriteFlaggedPrompt('a football star on stage');
    expect((mockParse.mock.calls[0][0] as any).messages[1].content).toBe(
      'a football star on stage'
    );
  });

  it('tells the model what a content checker rejects', async () => {
    await service.rewriteFlaggedPrompt('a football star on stage');
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      /real people/i
    );
  });

  it('returns an empty string when the call fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(
      await service.rewriteFlaggedPrompt('a football star on stage')
    ).toBe('');
  });

  it('returns an empty string when nothing was parsed', async () => {
    expect(
      await service.rewriteFlaggedPrompt('a football star on stage')
    ).toBe('');
  });
});

// Veo3's hygiene pass: English out regardless of the input language, no
// readable text anywhere in the scene, quoted dialogue kept verbatim. Empty on
// failure so the provider falls back to the raw prompt plus a static directive.
describe('OpenaiService.generateVideoPrompt', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParse.mockReset();
    mockParse.mockResolvedValue({ choices: [{ message: { parsed: {} } }] });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  it('returns the rewritten prompt', async () => {
    mockParse.mockResolvedValue({
      choices: [{ message: { parsed: { prompt: 'a night market scene' } } }],
    });
    expect(await service.generateVideoPrompt('سوق ليلي في الرياض')).toBe(
      'a night market scene'
    );
  });

  it('sends the description as the user message', async () => {
    await service.generateVideoPrompt('a lantern festival');
    expect((mockParse.mock.calls[0][0] as any).messages[1].content).toBe(
      'a lantern festival'
    );
  });

  it('asks for English, bans readable text, and keeps dialogue and proper nouns', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const system = (mockParse.mock.calls[0][0] as any).messages[0].content;
    expect(system).toMatch(/in English regardless/i);
    expect(system).toMatch(/never ask for readable text/i);
    expect(system).toMatch(/quoted dialogue/i);
    expect(system).toMatch(/proper nouns/i);
  });

  // The rewrite ships English to Veo, and Veo takes the spoken language from
  // the prompt text — so an Arabic description silently produced an English
  // narrator until the language was stated outright.
  it('ties any spoken audio to the language of the description', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const system = (mockParse.mock.calls[0][0] as any).messages[0].content;
    expect(system).toMatch(/identify the language the user wrote in/i);
    expect(system).toMatch(/spoken audio must be in that language/i);
  });

  // Veo hard-stops at 8 seconds and letterboxes anything it reads as filmic,
  // which cost 17% of the frame to black bars on a 9:16 render.
  it('asks for one continuous shot that fills the frame', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const system = (mockParse.mock.calls[0][0] as any).messages[0].content;
    expect(system).toMatch(/single continuous shot/i);
    expect(system).toMatch(/no cuts/i);
    expect(system).toMatch(/fill the entire frame/i);
    expect(system).toMatch(/letterbox/i);
  });

  it.each([
    ['none', /no spoken words and no music/i],
    ['ambient', /no spoken words/i],
    ['narration', /spoken voiceover/i],
  ])('states the %s audio intent', async (audio, expected) => {
    await service.generateVideoPrompt('a lantern festival', audio as any);
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      expected
    );
  });

  // Kept out of the shared reasoning-off table on purpose: this is the same
  // remedy generateSlidesFromText needed, and it is a pair. The rewrite holds
  // ten constraints at once and two of them pull against each other — the
  // prompt must be English while the speech tracks the user's language — which
  // is exactly what zero reasoning drops.
  it('runs gpt-5.6-luna with low reasoning', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const [params] = mockParse.mock.calls[0] as unknown as [
      { model: string; reasoning_effort: string; temperature?: number }
    ];
    expect(params.model).toBe('gpt-5.6-luna');
    expect(params.reasoning_effort).toBe('low');
    expect(params).not.toHaveProperty('temperature');
  });

  // The model commits to the language field before writing the prompt, so a
  // field called just "language" anchored the whole rewrite to it — an Arabic
  // description came back as an Arabic prompt. The field has to be scoped to
  // speech, and the prompt field has to restate English, because the schema
  // descriptions are what the model actually reads.
  it('scopes the language field to speech and keeps the prompt English', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const schema = JSON.stringify(
      (mockParse.mock.calls[0][0] as any).response_format
    );
    expect(schema).toMatch(/spokenLanguage/);
    expect(schema).toMatch(/written in English/i);
    expect(schema).not.toMatch(/"language"/);
  });

  // The first version named a subject shape and a camera move ("a tall upright
  // subject filling the height", "movement that rises"). Every render obeyed it
  // literally — Riyadh Season and Luxor Temple both came back as a rising shot
  // of a tall central structure. The rule may constrain the frame; it must not
  // choose the content.
  it('constrains the frame without dictating the subject or the camera move', async () => {
    await service.generateVideoPrompt('a lantern festival');
    const system = (mockParse.mock.calls[0][0] as any).messages[0].content;
    expect(system).not.toMatch(/tall upright subject/i);
    expect(system).not.toMatch(/movement that rises/i);
    expect(system).not.toMatch(/three or four/i);
    expect(system).toMatch(/let the scene decide/i);
  });

  it.each([
    ['vertical', /vertical 9:16/i],
    ['horizontal', /horizontal 16:9/i],
  ])('composes for a %s frame', async (output, expected) => {
    await service.generateVideoPrompt(
      'a lantern festival',
      'ambient',
      output as any
    );
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      expected
    );
  });

  it('defaults to a vertical frame', async () => {
    await service.generateVideoPrompt('a lantern festival');
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      /vertical 9:16/i
    );
  });

  it('defaults to ambient audio when no intent is given', async () => {
    await service.generateVideoPrompt('a lantern festival');
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      /no spoken words/i
    );
  });

  it('returns an empty string when the call fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(await service.generateVideoPrompt('a lantern festival')).toBe('');
  });

  it('returns an empty string when nothing was parsed', async () => {
    expect(await service.generateVideoPrompt('a lantern festival')).toBe('');
  });
});
