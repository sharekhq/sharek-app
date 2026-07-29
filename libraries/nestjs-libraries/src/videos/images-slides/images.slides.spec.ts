// The provider pulls in Transloadit, storage and music-metadata at module load;
// none of that is exercised by plan(), so stand in for them.
const mockCreateAssembly = jest.fn(async () => ({
  results: { subtitled: [{ url: 'https://transloadit/out.mp4' }] },
}));
jest.mock('transloadit', () => ({
  __esModule: true,
  default: class {
    createAssembly = mockCreateAssembly;
  },
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({
      uploadFile: jest.fn(async () => ({ path: 'https://cdn/audio.mp3' })),
    }),
  },
}));
// getAudioDuration parses a real MP3 header; the narrated path only needs a
// duration, not a decodable file.
jest.mock('music-metadata', () => ({
  parseBuffer: async () => ({ format: { duration: 3 } }),
}));

import {
  ImagesSlides,
  ImagesSlidesParams,
  MAX_CHARS_PER_SLIDE,
  MAX_SLIDES,
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
    // narrateOne hits ElevenLabs over global fetch; without this the suite
    // makes real unauthenticated requests on every run.
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        audio_base64: 'AAAA',
        alignment: {
          character_start_times_seconds: [0, 0.1, 0.2, 0.3],
          character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
        },
      }),
    })) as any;
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

describe('ImagesSlides.create cost guards', () => {
  const params = { prompt: 'p', voice: 'v', slides: 1, voiceover: false };

  const drain = async (gen: AsyncGenerator<any>) => {
    for await (const _event of gen) {
      /* exhaust */
    }
  };

  // The storyboard is submitted separately from customParams, so the 1-6 bound
  // on the request says nothing about what actually gets rendered. Without this
  // one video credit buys an unbounded image, TTS and encode bill.
  it('rejects a storyboard with more slides than the ceiling', async () => {
    const many = {
      styleGuide: 's',
      slides: Array.from({ length: MAX_SLIDES + 1 }, () => ({ text: 'a slide' })),
    };
    await expect(
      drain(provider.create('vertical', many, params))
    ).rejects.toThrow(/at most/);
  });

  it('accepts a storyboard exactly at the ceiling', async () => {
    openai.generateImagePromptsForSlides.mockResolvedValue(
      Array.from({ length: MAX_SLIDES }, () => 'a brass tray')
    );
    fal.generateImageFromText.mockResolvedValue('https://fal.media/a.jpeg');
    const exactly = {
      styleGuide: 's',
      slides: Array.from({ length: MAX_SLIDES }, () => ({ text: 'a slide' })),
    };
    await expect(
      drain(provider.create('vertical', exactly, params))
    ).resolves.toBeUndefined();
  });
});

// assemble() is where the SRT timeline, the silent-path step graph and the
// caption styling all land, and none of it is reachable by reading alone.
describe('ImagesSlides.assemble via the silent path', () => {
  const params = { prompt: 'p', voice: 'v', slides: 2, voiceover: false };

  const render = async (storyboard: any, output: 'vertical' | 'horizontal') => {
    const events: any[] = [];
    for await (const event of provider.create(output, storyboard, params)) {
      events.push(event);
    }
    return {
      events,
      steps: mockCreateAssembly.mock.calls[0][0].params.steps,
      srt: mockCreateAssembly.mock.calls[0][0].uploads['subtitles.srt'],
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    openai.generateImagePromptsForSlides.mockResolvedValue(['a', 'b']);
    fal.generateImageFromText.mockResolvedValue('https://fal.media/a.jpeg');
  });

  it('merges each image with no audio input when there is no voiceover', async () => {
    const { steps } = await render(
      { styleGuide: 's', slides: [{ text: 'One two' }, { text: 'Three four' }] },
      'vertical'
    );
    expect(steps.merge0.use).toEqual([{ name: 'image0', as: 'image' }]);
    expect(steps.merge1.use).toEqual([{ name: 'image1', as: 'image' }]);
    expect(steps.audio0).toBeUndefined();
    expect(steps.merge0.loop).toBe(true);
  });

  it('offsets the second slide by the first slide duration plus the concat gap', async () => {
    const { steps, srt } = await render(
      { styleGuide: 's', slides: [{ text: 'One two' }, { text: 'Three four' }] },
      'vertical'
    );
    // Every cue on slide 2 must start at or after slide 1's merge duration,
    // otherwise captions run against the wrong image.
    const startsMs = [...srt.matchAll(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})/gm)].map(
      (m: any) => +m[2] * 60000 + +m[3] * 1000 + +m[4]
    );
    expect(startsMs[0]).toBe(0);
    expect(startsMs[startsMs.length - 1]).toBeGreaterThanOrEqual(
      steps.merge0.duration * 1000
    );
  });

  it('burns Arabic captions in Noto Kufi Arabic and Latin in Inter', async () => {
    const { steps } = await render(
      { styleGuide: 's', slides: [{ text: 'لا تفوت العرض' }] },
      'vertical'
    );
    expect(steps.subtitled.font).toBe('Noto Kufi Arabic');
    expect(steps.subtitled.font_size).toBe(14);
    expect(steps.subtitled.border_style).toBe('outline');

    jest.clearAllMocks();
    openai.generateImagePromptsForSlides.mockResolvedValue(['a']);
    fal.generateImageFromText.mockResolvedValue('https://fal.media/a.jpeg');
    const latin = await render(
      { styleGuide: 's', slides: [{ text: 'Do not miss the offer' }] },
      'horizontal'
    );
    expect(latin.steps.subtitled.font).toBe('Inter');
    expect(latin.steps.subtitled.font_size).toBe(10);
  });

  it('returns the assembled url as the final event', async () => {
    const { events } = await render(
      { styleGuide: 's', slides: [{ text: 'One two' }] },
      'vertical'
    );
    expect(events[events.length - 1]).toEqual({
      name: 'done',
      url: 'https://transloadit/out.mp4',
    });
  });
});
