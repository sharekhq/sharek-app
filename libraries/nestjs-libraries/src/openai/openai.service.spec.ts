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
describe('OpenaiService model configuration', () => {
  beforeEach(() => mockParse.mockClear());

  const liveCalls: [string, () => Promise<unknown>][] = [
    ['generatePromptForPicture', () => service.generatePromptForPicture('a cat')],
    ['generateVoiceFromText', () => service.generateVoiceFromText('some post')],
    ['separatePosts', () => service.separatePosts('a long post', 280)],
    [
      'generateSlidesFromText',
      () =>
        service.generateSlidesFromText('a script', {
          slides: 4,
          wordsPerSlide: 20,
        }),
    ],
    [
      'generateImagePromptsForSlides',
      () => service.generateImagePromptsForSlides(['one'], 'warm cinematic'),
    ],
    [
      'rewriteFlaggedImagePrompt',
      () => service.rewriteFlaggedImagePrompt('a football star on stage'),
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
      'warm cinematic'
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
      await service.generateImagePromptsForSlides(['one', 'two'], 'warm cinematic')
    ).toEqual(['a brass tray', 'two']);
  });

  it('falls back entirely when the call fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(
      await service.generateImagePromptsForSlides(['one', 'two'], 'warm')
    ).toEqual(['one', 'two']);
  });

});

// The recovery path for a provider content flag: keep the scene, drop what the
// checker rejects. Empty on failure so the caller can give up cleanly instead
// of paying for a render that will be flagged again.
describe('OpenaiService.rewriteFlaggedImagePrompt', () => {
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
      await service.rewriteFlaggedImagePrompt('a football star on stage')
    ).toBe('an athlete on stage');
  });

  it('sends the flagged prompt as the user message', async () => {
    await service.rewriteFlaggedImagePrompt('a football star on stage');
    expect((mockParse.mock.calls[0][0] as any).messages[1].content).toBe(
      'a football star on stage'
    );
  });

  it('tells the model what a content checker rejects', async () => {
    await service.rewriteFlaggedImagePrompt('a football star on stage');
    expect((mockParse.mock.calls[0][0] as any).messages[0].content).toMatch(
      /real people/i
    );
  });

  it('returns an empty string when the call fails', async () => {
    mockParse.mockRejectedValue(new Error('boom'));
    expect(
      await service.rewriteFlaggedImagePrompt('a football star on stage')
    ).toBe('');
  });

  it('returns an empty string when nothing was parsed', async () => {
    expect(
      await service.rewriteFlaggedImagePrompt('a football star on stage')
    ).toBe('');
  });
});
