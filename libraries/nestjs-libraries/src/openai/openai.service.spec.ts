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
    ['generateSlidesFromText', () => service.generateSlidesFromText('a script')],
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
    await service.generateSlidesFromText('a script');
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
