import { Veo3 } from '@gitroom/nestjs-libraries/videos/veo3/veo3';

// Reference images are optional — the modal's hint says so and process() maps a
// missing list to []. A prompt-only submit sends no `images` key at all, so the
// DTO must accept an absent list while still capping a present one at 3.
describe('Veo3 params validation', () => {
  const veo3 = new Veo3();
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

    const result = new Veo3().process('vertical', { prompt: 'p', images: [] });
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

    const result = new Veo3().process('vertical', { prompt: 'p', images: [] });
    result.catch(() => undefined); // no unhandled rejection while timers advance
    await jest.advanceTimersByTimeAsync(11 * 60 * 1000);
    await expect(result).rejects.toThrow('timed out');
  });
});
