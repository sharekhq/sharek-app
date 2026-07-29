// The provider pulls in Transloadit, storage and music-metadata at module load;
// none of that is exercised by plan(), so stand in for them.
jest.mock('transloadit', () => ({ __esModule: true, default: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({ uploadFile: jest.fn() }) },
}));

import {
  ImagesSlides,
  ImagesSlidesParams,
  MAX_CHARS_PER_SLIDE,
} from './images.slides';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

const openai = {
  generateSlidesFromText: jest.fn(),
  generateImagePromptsForSlides: jest.fn(),
};
const fal = { generateImageFromText: jest.fn() };
const provider = new ImagesSlides(openai as any, fal as any);

const validateParams = (params: Partial<ImagesSlidesParams>) =>
  validate(plainToInstance(ImagesSlidesParams, params));

describe('ImagesSlidesParams', () => {
  const base = { prompt: 'a ramadan offer', voice: 'v1', slides: 4, voiceover: true };

  it('accepts a valid narrated request', async () => {
    expect(await validateParams(base)).toHaveLength(0);
  });

  it('rejects a slide count outside 1-6', async () => {
    expect(await validateParams({ ...base, slides: 0 })).not.toHaveLength(0);
    expect(await validateParams({ ...base, slides: 7 })).not.toHaveLength(0);
  });

  // The voice picker is hidden when narration is off, so requiring it would
  // make silent videos impossible to request — including from Samy.
  it('does not require a voice when voiceover is off', async () => {
    expect(
      await validateParams({ prompt: 'a ramadan offer', slides: 3, voiceover: false })
    ).toHaveLength(0);
  });

  it('requires a voice when voiceover is on', async () => {
    expect(
      await validateParams({ prompt: 'a ramadan offer', slides: 3, voiceover: true })
    ).not.toHaveLength(0);
  });
});

describe('ImagesSlides.plan', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks the planner for the requested number of slides', async () => {
    openai.generateSlidesFromText.mockResolvedValue({
      styleGuide: 'warm',
      slides: [{ text: 'a' }],
    });
    await provider.plan({ prompt: 'p', voice: 'v', slides: 5, voiceover: true });
    expect(openai.generateSlidesFromText).toHaveBeenCalledWith(
      'p',
      expect.objectContaining({ slides: 5 })
    );
  });

  // The count is advisory (D34): show the user what came back rather than retry.
  it('returns whatever the planner produced, even if the count differs', async () => {
    openai.generateSlidesFromText.mockResolvedValue({
      styleGuide: 'warm',
      slides: [{ text: 'a' }, { text: 'b' }],
    });
    const storyboard = await provider.plan({
      prompt: 'p',
      voice: 'v',
      slides: 6,
      voiceover: true,
    });
    expect(storyboard.slides).toHaveLength(2);
  });

  it('throws when the planner produced nothing at all', async () => {
    openai.generateSlidesFromText.mockResolvedValue({ styleGuide: '', slides: [] });
    await expect(
      provider.plan({ prompt: 'p', voice: 'v', slides: 4, voiceover: true })
    ).rejects.toThrow();
  });
});

describe('ImagesSlides.create', () => {
  const storyboard = {
    styleGuide: 'warm cinematic, brass palette',
    slides: [{ text: 'One.' }],
  };
  const params = { prompt: 'p', voice: 'v', slides: 1, voiceover: true };

  const drain = async (gen: AsyncGenerator<any>) => {
    const events: any[] = [];
    for await (const e of gen) events.push(e);
    return events;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    openai.generateImagePromptsForSlides.mockResolvedValue(['a brass tray']);
    fal.generateImageFromText.mockResolvedValue('https://fal.media/a.jpeg');
  });

  it('requests ideogram/v4 at the vertical frame size with expansion disabled', async () => {
    await drain(provider.create('vertical', storyboard, params)).catch(
      () => undefined
    );
    expect(fal.generateImageFromText).toHaveBeenCalledWith(
      'ideogram/v4',
      expect.stringContaining('a brass tray'),
      expect.objectContaining({
        image_size: { width: 1080, height: 1920 },
        rendering_speed: 'BALANCED',
        expansion_model: 'None',
      })
    );
  });

  it('appends the shared style guide to every image prompt', async () => {
    await drain(provider.create('vertical', storyboard, params)).catch(
      () => undefined
    );
    expect(fal.generateImageFromText.mock.calls[0][1]).toContain(
      'warm cinematic, brass palette'
    );
  });

  it('uses the horizontal frame size when asked', async () => {
    await drain(provider.create('horizontal', storyboard, params)).catch(
      () => undefined
    );
    expect(fal.generateImageFromText.mock.calls[0][2].image_size).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  // The cap is the cost guard: unbounded slide text means unbounded TTS and a
  // proportionally unbounded encode, all against one video credit (D27).
  it('rejects a slide longer than the hard character cap', async () => {
    const long = {
      styleGuide: 's',
      slides: [{ text: 'x'.repeat(MAX_CHARS_PER_SLIDE + 1) }],
    };
    await expect(drain(provider.create('vertical', long, params))).rejects.toThrow();
  });

  it('makes no voice call when voiceover is off', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    await drain(
      provider.create('vertical', storyboard, { ...params, voiceover: false })
    ).catch(() => undefined);
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('elevenlabs');
    }
  });
});
