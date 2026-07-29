// FalService talks to fal over global fetch with no SDK, so standing in for
// fetch is the only way to see the request it builds.
import { FalService } from './fal.service';

const service = new FalService();
const mockFetch = jest.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    json: async () => ({
      images: [{ url: 'https://fal.media/x.jpeg', width: 1080, height: 1920 }],
    }),
  });
  global.fetch = mockFetch as unknown as typeof fetch;
  process.env.FAL_KEY = 'test-key';
});

const bodyOf = () => JSON.parse(mockFetch.mock.calls[0][1].body);

describe('FalService.generateImageFromText', () => {
  // v4 is published under the `ideogram` owner namespace, so the old hardcoded
  // `fal-ai/` prefix 404s it.
  it('posts to the endpoint id verbatim, with no owner prefix added', async () => {
    await service.generateImageFromText('ideogram/v4', 'a pomegranate');
    expect(mockFetch.mock.calls[0][0]).toBe('https://fal.run/ideogram/v4');
  });

  it('returns the first image url', async () => {
    expect(
      await service.generateImageFromText('ideogram/v4', 'a pomegranate')
    ).toBe('https://fal.media/x.jpeg');
  });

  it('merges caller params into the body alongside the prompt', async () => {
    await service.generateImageFromText('ideogram/v4', 'a pomegranate', {
      image_size: { width: 1080, height: 1920 },
      rendering_speed: 'BALANCED',
      expansion_model: 'None',
    });
    expect(bodyOf()).toEqual({
      prompt: 'a pomegranate',
      image_size: { width: 1080, height: 1920 },
      rendering_speed: 'BALANCED',
      expansion_model: 'None',
    });
  });

  // These were silently dropped by fal — they are in no Ideogram schema — and
  // sending them again would just re-hide the fact that nothing was applied.
  it('sends no fields the caller did not ask for', async () => {
    await service.generateImageFromText('ideogram/v4', 'a pomegranate');
    const body = bodyOf();
    for (const dead of [
      'resolution',
      'num_images',
      'output_format',
      'aspect_ratio',
      'expand_prompt',
    ]) {
      expect(body).not.toHaveProperty(dead);
    }
  });
});
