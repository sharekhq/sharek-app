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
