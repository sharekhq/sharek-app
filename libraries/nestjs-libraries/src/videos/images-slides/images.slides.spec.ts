// The provider pulls in Transloadit, storage and music-metadata at module load;
// none of that is exercised by plan(), so stand in for them.
jest.mock('transloadit', () => ({ __esModule: true, default: class {} }));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({ uploadFile: jest.fn() }) },
}));

import { ImagesSlides, ImagesSlidesParams } from './images.slides';
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
