// The modal is the only caller of /media/generate-image-with-prompt, and the
// pixel authority lives on the server: the client sends a preset id, never raw
// dimensions. These are the edge checks that keep a tampered or drifting client
// from reaching the renderer. (feature 006-ai-image-modal-v2, foundational.)
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GenerateImageWithPromptDto } from './generate.image.dto';
import { IMAGE_REFERENCE_MAX } from './image.generation.catalog';

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

  // References name Media rows by id, never by URL (FR-006): the server reads
  // only files its own storage wrote, from the organization that asked.
  // (feature 031-ai-image-references-edit, US1.)
  describe('references', () => {
    const uuid = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const ids = (count: number) =>
      Array.from({ length: count }, (_, i) => uuid(i + 1));
    const constraintsOf = async (payload: Record<string, unknown>) => {
      const errors = await validate(
        plainToInstance(GenerateImageWithPromptDto, payload)
      );
      return errors.flatMap((error) => Object.keys(error.constraints || {}));
    };

    it('accepts the cap, which is the most one render takes', async () => {
      expect(
        await failures({ ...valid, references: ids(IMAGE_REFERENCE_MAX) })
      ).toEqual([]);
    });

    it('rejects one more than the cap', async () => {
      expect(
        await constraintsOf({
          ...valid,
          references: ids(IMAGE_REFERENCE_MAX + 1),
        })
      ).toContain('arrayMaxSize');
    });

    // The same image twice is one reference sent twice (FR-005).
    it('rejects the same image twice', async () => {
      expect(
        await constraintsOf({ ...valid, references: [uuid(1), uuid(1)] })
      ).toContain('arrayUnique');
    });

    it.each([
      ['a URL', 'https://evil/x.png'],
      ['an empty string', ''],
    ])('rejects %s in place of a Media id', async (_case, reference) => {
      expect(
        await constraintsOf({ ...valid, references: [reference] })
      ).toContain('isUuid');
    });
  });
});
