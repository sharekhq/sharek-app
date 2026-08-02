// The modal is the only caller of /media/generate-image-with-prompt, and the
// pixel authority lives on the server: the client sends a preset id, never raw
// dimensions. These are the edge checks that keep a tampered or drifting client
// from reaching the renderer. (feature 006-ai-image-modal-v2, foundational.)
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateImageWithPromptDto } from './generate.image.dto';

const failures = async (payload: Record<string, unknown>) => {
  const errors = await validate(
    plainToInstance(GenerateImageWithPromptDto, payload)
  );
  return errors.map((error) => error.property).sort();
};

const valid = { prompt: 'a pomegranate on a brass tray', aspectRatio: 'story' };

describe('GenerateImageWithPromptDto', () => {
  it('accepts a prompt and an aspect ratio on their own', async () => {
    expect(await failures(valid)).toEqual([]);
  });

  it('accepts a catalog style alongside them', async () => {
    expect(await failures({ ...valid, style: 'flat_illustration' })).toEqual([]);
  });

  it.each([
    ['missing', { aspectRatio: 'story' }],
    ['empty', { ...valid, prompt: '' }],
    ['not a string', { ...valid, prompt: 42 }],
    ['over 2000 characters', { ...valid, prompt: 'a'.repeat(2001) }],
  ])('rejects a prompt that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('prompt');
  });

  it('accepts a prompt of exactly 2000 characters', async () => {
    expect(await failures({ ...valid, prompt: 'a'.repeat(2000) })).toEqual([]);
  });

  it.each([
    ['missing', { prompt: valid.prompt }],
    ['an unknown preset', { ...valid, aspectRatio: 'wide' }],
    ['raw dimensions', { ...valid, aspectRatio: '1792x1008' }],
  ])('rejects an aspect ratio that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('aspectRatio');
  });

  it('rejects a style that is not in the catalog', async () => {
    expect(await failures({ ...valid, style: 'vaporwave' })).toContain('style');
  });

  // Auto imposes nothing: the client omits the field rather than sending a
  // sentinel the enhancement step would have to special-case.
  it('rejects "auto" as a style rather than treating it as the sentinel', async () => {
    expect(await failures({ ...valid, style: 'auto' })).toContain('style');
  });
});
