import {
  Veo3,
  VEO3_NO_TEXT_DIRECTIVE,
} from '@gitroom/nestjs-libraries/videos/veo3/veo3';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';

// Reference images are optional — the modal's hint says so and process() maps a
// missing list to []. A prompt-only submit sends no `images` key at all, so the
// DTO must accept an absent list while still capping a present one at 3.
describe('Veo3 params validation', () => {
  const veo3 = new Veo3({} as any);
  const image = (n: number) => ({ id: `id-${n}`, path: `https://x/${n}.png` });

  it('accepts a prompt without images', async () => {
    await expect(
      veo3.processAndValidate({ prompt: 'a calm sea at dawn' } as any)
    ).resolves.toBeUndefined();
  });

  it('accepts a prompt with up to 3 images', async () => {
    await expect(
      veo3.processAndValidate({
        prompt: 'a calm sea at dawn',
        images: [image(1), image(2), image(3)],
      } as any)
    ).resolves.toBeUndefined();
  });

  it('rejects more than 3 images', async () => {
    await expect(
      veo3.processAndValidate({
        prompt: 'a calm sea at dawn',
        images: [image(1), image(2), image(3), image(4)],
      } as any)
    ).rejects.toThrow();
  });

  // Audio is prompt-driven — kie.ai has no audio parameter — so the choice is
  // an enum the hygiene pass turns into words. Absent means ambient.
  it('accepts a known audio choice', async () => {
    await expect(
      veo3.processAndValidate({
        prompt: 'a calm sea at dawn',
        audio: 'narration',
      } as any)
    ).resolves.toBeUndefined();
  });

  it('rejects an unknown audio choice', async () => {
    await expect(
      veo3.processAndValidate({
        prompt: 'a calm sea at dawn',
        audio: 'karaoke',
      } as any)
    ).rejects.toThrow();
  });

  it('rejects a non-array images value', async () => {
    await expect(
      veo3.processAndValidate({
        prompt: 'a calm sea at dawn',
        images: 'not-an-array',
      } as any)
    ).rejects.toThrow();
  });
});

const jsonResponse = (payload: unknown) => ({ json: async () => payload });

const pendingPoll = jsonResponse({
  code: 200,
  data: { response: { resultUrls: [] } },
});

describe('Veo3.process', () => {
  const realFetch = global.fetch;

  // The provider's two luna hooks. Defaults: rewrite unavailable, so the raw
  // prompt goes through — tests that exercise the rewrite override these.
  const openaiMock = () => ({
    generateVideoPrompt: jest.fn().mockResolvedValue(''),
    rewriteFlaggedPrompt: jest.fn().mockResolvedValue(''),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.KIEAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('returns the first result url once the task completes', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(pendingPoll)
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { response: { resultUrls: ['https://cdn/video.mp4'] } },
        })
      ) as any;

    const result = new Veo3(openaiMock() as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('https://cdn/video.mp4');
  });

  it('gives up when the task never completes', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValue(pendingPoll) as any;

    const result = new Veo3(openaiMock() as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    result.catch(() => undefined); // no unhandled rejection while timers advance
    await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
    await expect(result).rejects.toThrow('timed out');
  });

  // The message is only worth writing if it survives the normalisation every
  // render path applies: generationError() swaps a plain Error for a generic
  // 500 and only lets an HttpException through.
  it('reports the timeout as an error the user actually sees', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValue(pendingPoll) as any;

    const result = new Veo3(openaiMock() as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(11 * 60 * 1000);

    const err = await result.catch((e) => e);
    expect(generationError(err).getResponse()).toBe(
      'The video render timed out, please try again.'
    );
  });

  it('sends the rewritten prompt with the no-text directive', async () => {
    const openai = openaiMock();
    openai.generateVideoPrompt.mockResolvedValue('a night festival scene');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { response: { resultUrls: ['https://cdn/video.mp4'] } },
        })
      ) as any;

    const result = new Veo3(openai as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('https://cdn/video.mp4');

    expect(openai.generateVideoPrompt).toHaveBeenCalledWith('p', 'ambient');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.prompt).toBe(
      `a night festival scene. ${VEO3_NO_TEXT_DIRECTIVE}`
    );
  });

  it('passes the chosen audio through to the hygiene pass', async () => {
    const openai = openaiMock();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { response: { resultUrls: ['https://cdn/video.mp4'] } },
        })
      ) as any;

    const result = new Veo3(openai as any).process('vertical', {
      prompt: 'p',
      images: [],
      audio: 'narration',
    } as any);
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('https://cdn/video.mp4');

    expect(openai.generateVideoPrompt).toHaveBeenCalledWith('p', 'narration');
  });

  it('falls back to the raw prompt when the rewrite is empty', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { response: { resultUrls: ['https://cdn/video.mp4'] } },
        })
      ) as any;

    const result = new Veo3(openaiMock() as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('https://cdn/video.mp4');

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.prompt).toBe(`p. ${VEO3_NO_TEXT_DIRECTIVE}`);
  });

  it('reports a render that failed to start', async () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 500, msg: 'boom' })) as any;

    await expect(
      new Veo3(openaiMock() as any).process('vertical', {
        prompt: 'p',
        images: [],
      })
    ).rejects.toThrow('The video render failed to start, please try again.');
    errorSpy.mockRestore();
  });

  it('fails fast when the task reports failure instead of waiting for the timeout', async () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const openai = openaiMock();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            successFlag: 2,
            errorCode: 500,
            errorMessage: 'internal error',
            response: { resultUrls: [] },
          },
        })
      ) as any;

    const result = new Veo3(openai as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(1_000);

    const err = await result.catch((e) => e);
    expect(generationError(err).getResponse()).toBe(
      'The video render failed, please try again.'
    );
    // A non-policy failure must not trigger the sanitized retry.
    expect(openai.rewriteFlaggedPrompt).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  const flaggedPoll = jsonResponse({
    code: 200,
    data: {
      successFlag: 3,
      errorCode: 400,
      errorMessage: 'flagged',
      response: { resultUrls: [] },
    },
  });

  it('retries once with a sanitized prompt when the render is flagged', async () => {
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const openai = openaiMock();
    openai.rewriteFlaggedPrompt.mockResolvedValue('a calm festival');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(flaggedPoll)
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't2' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { response: { resultUrls: ['https://cdn/video.mp4'] } },
        })
      ) as any;

    const result = new Veo3(openai as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe('https://cdn/video.mp4');

    // The rewriter gets the base prompt, not the directive-suffixed one; the
    // retry ships with the directive re-appended.
    expect(openai.rewriteFlaggedPrompt).toHaveBeenCalledWith('p');
    const retryBody = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[2][1].body
    );
    expect(retryBody.prompt).toBe(`a calm festival. ${VEO3_NO_TEXT_DIRECTIVE}`);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('gives up with the safety message when the sanitized prompt is flagged again', async () => {
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const openai = openaiMock();
    openai.rewriteFlaggedPrompt.mockResolvedValue('a calm festival');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(flaggedPoll)
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't2' } })
      )
      .mockResolvedValueOnce(flaggedPoll) as any;

    const result = new Veo3(openai as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(1_000);

    const err = await result.catch((e) => e);
    expect(generationError(err).getResponse()).toBe(
      'The video was rejected by the AI safety system even after a rewrite. Please reword your prompt and try again.'
    );
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('surfaces the original rejection when no rewrite is available', async () => {
    const logSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, data: { taskId: 't1' } })
      )
      .mockResolvedValueOnce(flaggedPoll) as any;

    const result = new Veo3(openaiMock() as any).process('vertical', {
      prompt: 'p',
      images: [],
    });
    result.catch(() => undefined);
    await jest.advanceTimersByTimeAsync(1_000);

    const err = await result.catch((e) => e);
    expect(generationError(err).getResponse()).toBe(
      'The video was rejected by the AI safety system. Please reword your prompt and try again.'
    );
    // Only the original submit + poll — no second render without a rewrite.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
