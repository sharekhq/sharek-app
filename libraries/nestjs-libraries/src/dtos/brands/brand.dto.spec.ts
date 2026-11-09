// The Brands page's two bodies: a new brand's name, and the kit a brand's
// images are made with. These are the edge checks the page's own limits rely
// on, so a tampered client stops at a 400 rather than at the database.
// (spec 053-brands, contracts/brands-api.md.)
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrandKitDto, CreateBrandDto } from './brand.dto';

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

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => uuid(i + 1));
const colours = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `#${String(i + 1).padStart(2, '0')}AA33`
  );

describe('CreateBrandDto', () => {
  const { failures } = validating(CreateBrandDto);

  it('accepts a name on its own', async () => {
    expect(await failures({ name: 'Rawda' })).toEqual([]);
  });

  it('accepts the first brand taking the channels in no brand', async () => {
    expect(await failures({ name: 'Rawda', moveUngrouped: true })).toEqual([]);
  });

  it('trims the name before it is checked and saved', async () => {
    const body = { name: '  Rawda  ' };
    expect(plainToInstance(CreateBrandDto, body).name).toBe('Rawda');
    expect(await failures({ name: `  ${'a'.repeat(60)}  ` })).toEqual([]);
  });

  it('accepts a name of exactly 60 characters', async () => {
    expect(await failures({ name: 'a'.repeat(60) })).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['only spaces', { name: '   ' }],
    ['not a string', { name: 42 }],
    ['over 60 characters', { name: 'a'.repeat(61) }],
  ])('rejects a name that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('name');
  });

  it('rejects a move that is not a boolean', async () => {
    expect(await failures({ name: 'Rawda', moveUngrouped: 'true' })).toContain(
      'moveUngrouped'
    );
  });
});

// Only the fields present change (two members editing different parts of one
// kit don't overwrite each other), so every field is optional, and null clears
// the logo or a font but never a list.
describe('BrandKitDto', () => {
  const { failures, constraintsOf } = validating(BrandKitDto);

  it('accepts an empty body, which changes nothing', async () => {
    expect(await failures({})).toEqual([]);
  });

  it('accepts a full kit', async () => {
    expect(
      await failures({
        logoId: uuid(1),
        exampleIds: ids(3),
        colours: colours(6),
        headingFont: 'Tajawal',
        bodyFont: 'Inter',
      })
    ).toEqual([]);
  });

  describe('logoId', () => {
    it('accepts null, which removes the logo', async () => {
      expect(await failures({ logoId: null })).toEqual([]);
    });

    it.each([
      ['a URL', 'https://evil/x.png'],
      ['an empty string', ''],
    ])('rejects %s in place of a Media id', async (_case, logoId) => {
      expect(await constraintsOf({ logoId })).toContain('isUuid');
    });
  });

  // Example posts name Media rows by id, never by URL, as image references do.
  describe('exampleIds', () => {
    it('accepts none, which empties the list', async () => {
      expect(await failures({ exampleIds: [] })).toEqual([]);
    });

    it('accepts three, the most a kit holds', async () => {
      expect(await failures({ exampleIds: ids(3) })).toEqual([]);
    });

    it('rejects a fourth', async () => {
      expect(await constraintsOf({ exampleIds: ids(4) })).toContain(
        'arrayMaxSize'
      );
    });

    it('rejects the same image twice', async () => {
      expect(await constraintsOf({ exampleIds: [uuid(1), uuid(1)] })).toContain(
        'arrayUnique'
      );
    });

    it.each([
      ['a URL', 'https://evil/x.png'],
      ['an empty string', ''],
    ])('rejects %s in place of a Media id', async (_case, id) => {
      expect(await constraintsOf({ exampleIds: [id] })).toContain('isUuid');
    });

    it('rejects null, since a list is emptied, not cleared', async () => {
      expect(await failures({ exampleIds: null })).toContain('exampleIds');
    });
  });

  describe('colours', () => {
    it('accepts none, which empties the list', async () => {
      expect(await failures({ colours: [] })).toEqual([]);
    });

    it('accepts six, the most a kit holds', async () => {
      expect(await failures({ colours: colours(6) })).toEqual([]);
    });

    it('accepts lowercase hex, which is stored uppercase', async () => {
      expect(await failures({ colours: ['#b5542c'] })).toEqual([]);
    });

    it('rejects a seventh', async () => {
      expect(await constraintsOf({ colours: colours(7) })).toContain(
        'arrayMaxSize'
      );
    });

    it('rejects the same colour twice', async () => {
      expect(
        await constraintsOf({ colours: ['#B5542C', '#B5542C'] })
      ).toContain('arrayUnique');
    });

    // Stored uppercase, these two would be the same colour twice.
    it('rejects the same colour twice in different cases', async () => {
      expect(
        await constraintsOf({ colours: ['#b5542c', '#B5542C'] })
      ).toContain('arrayUnique');
    });

    it.each([
      ['no hash', 'B5542C'],
      ['three digits', '#B54'],
      ['eight digits', '#B5542CFF'],
      ['not hex', '#B5542G'],
      ['a colour name', 'red'],
      ['not a string', 42],
    ])('rejects a colour with %s', async (_case, colour) => {
      expect(await constraintsOf({ colours: [colour] })).toContain('matches');
    });

    it('rejects null, since a list is emptied, not cleared', async () => {
      expect(await failures({ colours: null })).toContain('colours');
    });
  });

  describe.each(['headingFont', 'bodyFont'])('%s', (font) => {
    it('accepts null, which clears it', async () => {
      expect(await failures({ [font]: null })).toEqual([]);
    });

    it('trims it before it is checked and saved', async () => {
      const kit = plainToInstance(BrandKitDto, { [font]: '  Tajawal  ' });
      expect(kit[font as keyof BrandKitDto]).toBe('Tajawal');
      expect(await failures({ [font]: `  ${'a'.repeat(60)}  ` })).toEqual([]);
    });

    // An emptied field clears the font as null does, rather than saving "".
    it.each([
      ['empty', ''],
      ['only spaces', '   '],
    ])('clears it when it is %s', async (_case, value) => {
      const kit = plainToInstance(BrandKitDto, { [font]: value });
      expect(kit[font as keyof BrandKitDto]).toBeNull();
      expect(await failures({ [font]: value })).toEqual([]);
    });

    it('accepts exactly 60 characters', async () => {
      expect(await failures({ [font]: 'a'.repeat(60) })).toEqual([]);
    });

    it('rejects over 60 characters', async () => {
      expect(await constraintsOf({ [font]: 'a'.repeat(61) })).toContain(
        'maxLength'
      );
    });

    it('rejects a font that is not a string', async () => {
      expect(await constraintsOf({ [font]: 42 })).toContain('isString');
    });
  });
});
