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
  rewriteFlaggedImagePrompt: jest.fn(),
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

// A provider content flag on one slide's prompt is recoverable: rewrite that
// prompt once and re-render, instead of failing a deck the user already
// scripted. A second flag names the slide so the user knows what to reword.
describe('ImagesSlides.create safety retry', () => {
  const params = { prompt: 'p', voice: 'v', slides: 2, voiceover: false };
  const storyboard = {
    styleGuide: 'warm cinematic',
    slides: [{ text: 'One' }, { text: 'Two' }],
  };
  const flaggedBody =
    'fal ideogram/v4 returned no image: {"detail":{"type":"content_policy_violation"}}';

  const drain = async (gen: AsyncGenerator<any>) => {
    const events: any[] = [];
    for await (const e of gen) events.push(e);
    return events;
  };

  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    openai.generateImagePromptsForSlides.mockResolvedValue(['a star', 'a tray']);
    openai.rewriteFlaggedImagePrompt.mockResolvedValue('an athlete');
  });

  afterEach(() => logSpy.mockRestore());

  it('re-renders a flagged slide once with a sanitized prompt', async () => {
    fal.generateImageFromText
      .mockRejectedValueOnce(new Error(flaggedBody))
      .mockResolvedValue('https://fal.media/a.jpeg');

    const events = await drain(provider.create('vertical', storyboard, params));

    expect(events[events.length - 1].name).toBe('done');
    expect(openai.rewriteFlaggedImagePrompt).toHaveBeenCalledWith('a star');
    // Calls land in order: slide 1, slide 2, then slide 1's retry — which must
    // carry the sanitized subject and still get the shared style guide.
    expect(fal.generateImageFromText).toHaveBeenCalledTimes(3);
    expect(fal.generateImageFromText.mock.calls[2][1]).toContain('an athlete');
    expect(fal.generateImageFromText.mock.calls[2][1]).toContain(
      'warm cinematic'
    );
  });

  it('fails naming the slide when the sanitized prompt is flagged again', async () => {
    fal.generateImageFromText.mockImplementation(
      async (_model: string, prompt: string) => {
        if (prompt.includes('a tray') || prompt.includes('an athlete')) {
          throw new Error(flaggedBody);
        }
        return 'https://fal.media/a.jpeg';
      }
    );

    const failing = drain(provider.create('vertical', storyboard, params));

    await expect(failing).rejects.toThrow(/slide 2/);
    // 422, not the generic mapping — the message must reach the user as-is.
    await expect(failing).rejects.toHaveProperty('status', 422);
  });

  it('gives up without a second render when the rewrite fails', async () => {
    openai.rewriteFlaggedImagePrompt.mockResolvedValue('');
    fal.generateImageFromText.mockImplementation(
      async (_model: string, prompt: string) => {
        if (prompt.includes('a star')) {
          throw new Error(flaggedBody);
        }
        return 'https://fal.media/a.jpeg';
      }
    );

    await expect(
      drain(provider.create('vertical', storyboard, params))
    ).rejects.toThrow(/slide 1/);
    // One render for the flagged slide, one for the healthy one — no retry.
    expect(fal.generateImageFromText).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-safety failure without rewriting', async () => {
    fal.generateImageFromText.mockRejectedValue(
      new Error('fal ideogram/v4 returned no image: {"detail":"Exhausted balance"}')
    );

    await expect(
      drain(
        provider.create('vertical', { ...storyboard, slides: [{ text: 'One' }] }, params)
      )
    ).rejects.toThrow(/Exhausted balance/);
    expect(openai.rewriteFlaggedImagePrompt).not.toHaveBeenCalled();
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

// The queue bridge in MediaService only pays off if create() actually emits
// progress while work is still outstanding, rather than in a burst at the end.
describe('ImagesSlides.create progress', () => {
  const params = { prompt: 'p', voice: 'v', slides: 3, voiceover: false };
  const storyboard = {
    styleGuide: 's',
    slides: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    openai.generateImagePromptsForSlides.mockResolvedValue(['a', 'b', 'c']);
  });

  it('reports each image as it lands, not all of them at the end', async () => {
    // Resolve the three image calls out of order and one at a time, so a
    // Promise.all implementation would emit nothing until the slowest settled.
    const release: ((url: string) => void)[] = [];
    fal.generateImageFromText.mockImplementation(
      () => new Promise((resolve) => release.push(resolve))
    );

    const events: any[] = [];
    const gen = provider.create('vertical', storyboard, params);

    // Drain until the generator is waiting on the images.
    let next = await gen.next();
    while (!next.done && next.value.step !== 'images') {
      events.push(next.value);
      next = await gen.next();
    }
    events.push(next.value);

    // Resume without awaiting: this call is what creates the fal promises, and
    // it will not settle until one of them does.
    let pending = gen.next();
    await new Promise((r) => setTimeout(r, 0));
    expect(release).toHaveLength(3);

    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      release[i]('https://fal.media/a.jpeg');
      // eslint-disable-next-line no-await-in-loop
      const event = await pending;
      counts.push(event.value.done);
      if (i < 2) {
        pending = gen.next();
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    expect(counts).toEqual([1, 2, 3]);
    await gen.return(undefined as any);
  });

  it('announces assembling directly when there is no voiceover', async () => {
    fal.generateImageFromText.mockResolvedValue('https://fal.media/a.jpeg');
    const steps: string[] = [];
    for await (const event of provider.create('vertical', storyboard, params)) {
      if (event.name === 'progress') steps.push(event.step);
    }
    expect(steps).not.toContain('voicing');
    expect(steps[steps.length - 1]).toBe('assembling');
  });
});
