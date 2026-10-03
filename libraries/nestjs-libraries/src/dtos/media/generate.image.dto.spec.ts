// The modal is the only caller of /media/generate-image-with-prompt, and the
// pixel authority lives on the server: the client sends a preset id, never raw
// dimensions. These are the edge checks that keep a tampered or drifting client
// from reaching the renderer. (feature 006-ai-image-modal-v2, foundational.)
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  EditImageWithPromptDto,
  GenerateImageWithPromptDto,
} from './generate.image.dto';
import { IMAGE_REFERENCE_MAX } from './image.generation.catalog';

// What validating a body against one DTO reports: the properties that failed,
// or every constraint that did. Bound to its class rather than defaulting to
// one, so a case written for a class that does not exist yet cannot pass
// against another.
const validating = (dto: ClassConstructor<object>) => {
  const errorsOf = (payload: Record<string, unknown>) =>
    validate(plainToInstance(dto, payload));
  return {
    failures: async (payload: Record<string, unknown>) =>
      (await errorsOf(payload)).map((error) => error.property).sort(),
    constraintsOf: async (payload: Record<string, unknown>) =>
      (await errorsOf(payload)).flatMap((error) =>
        Object.keys(error.constraints || {})
      ),
  };
};

const { failures, constraintsOf } = validating(GenerateImageWithPromptDto);

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => uuid(i + 1));

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

// The edit route's body: the version on screen, named by its Media id like a
// reference, the change, and the preset that version was made at, because an
// edit keeps its frame. (feature 031-ai-image-references-edit, US2.)
describe('EditImageWithPromptDto', () => {
  const { failures, constraintsOf } = validating(EditImageWithPromptDto);
  const edit = {
    imageId: uuid(9),
    prompt: 'make the background plain white',
    aspectRatio: 'portrait',
  };

  it('accepts an image, a change and a preset on their own', async () => {
    expect(await failures(edit)).toEqual([]);
  });

  it.each([
    ['missing', { prompt: edit.prompt, aspectRatio: edit.aspectRatio }],
    ['a URL', { ...edit, imageId: 'https://evil/x.png' }],
  ])('rejects an image that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('imageId');
  });

  it.each([
    ['missing', { imageId: edit.imageId, aspectRatio: edit.aspectRatio }],
    ['empty', { ...edit, prompt: '' }],
    ['over 2000 characters', { ...edit, prompt: 'a'.repeat(2001) }],
  ])('rejects a change that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('prompt');
  });

  it('accepts a change of exactly 2000 characters', async () => {
    expect(await failures({ ...edit, prompt: 'a'.repeat(2000) })).toEqual([]);
  });

  it.each([
    ['missing', { imageId: edit.imageId, prompt: edit.prompt }],
    ['raw dimensions', { ...edit, aspectRatio: '1024x1280' }],
  ])('rejects an aspect ratio that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('aspectRatio');
  });

  // The edited image is image 1 of the render, so the cap leaves one fewer
  // for the images added to it (FR-013).
  describe('references', () => {
    it('accepts one fewer than the cap', async () => {
      expect(
        await failures({ ...edit, references: ids(IMAGE_REFERENCE_MAX - 1) })
      ).toEqual([]);
    });

    it('rejects as many as the cap', async () => {
      expect(
        await constraintsOf({ ...edit, references: ids(IMAGE_REFERENCE_MAX) })
      ).toContain('arrayMaxSize');
    });

    it('rejects the same image twice', async () => {
      expect(
        await constraintsOf({ ...edit, references: [uuid(1), uuid(1)] })
      ).toContain('arrayUnique');
    });

    it('rejects a URL in place of a Media id', async () => {
      expect(
        await constraintsOf({ ...edit, references: ['https://evil/x.png'] })
      ).toContain('isUuid');
    });
  });
});
