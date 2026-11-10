// The Brands page's bodies: a new brand's name, the kit a brand's images are
// made with, and what "Fill from my website" looks up and keeps. These are the edge checks the page's own limits rely
// on, so a tampered client stops at a 400 rather than at the database.
// (spec 053-brands, contracts/brands-api.md.)
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BrandKitDto,
  BrandKitFromWebsiteDto,
  BrandWebsiteColoursDto,
  BrandWebsiteDto,
  CreateBrandDto,
} from './brand.dto';

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

// "Fill from my website" (part 3). The lookup fetches these addresses, and
// readOrFetch reads any string that doesn't start with "http" as a local
// file's path, so only absolute http(s) addresses get through.
describe('BrandWebsiteDto', () => {
  const { failures, constraintsOf } = validating(BrandWebsiteDto);
  const urlOf = (url: unknown) => plainToInstance(BrandWebsiteDto, { url }).url;

  it.each([
    ['an https address', 'https://www.noordental.sa/'],
    ['an http address', 'http://noordental.sa/ar'],
  ])('accepts %s as it is', async (_case, url) => {
    expect(urlOf(url)).toBe(url);
    expect(await failures({ url })).toEqual([]);
  });

  // The card's field takes a domain as people type it.
  it('looks a bare domain up on https://, trimmed', async () => {
    expect(urlOf('  noordental.sa/ar  ')).toBe('https://noordental.sa/ar');
    expect(await failures({ url: 'noordental.sa' })).toEqual([]);
  });

  it('keeps an address that names http or https in capitals', async () => {
    expect(urlOf('HTTPS://Noordental.sa')).toBe('HTTPS://Noordental.sa');
    expect(await failures({ url: 'HTTPS://Noordental.sa' })).toEqual([]);
  });

  // A bare domain and a path, so the https:// added makes it `length` long
  it('accepts 2,048 characters and rejects 2,049, the https:// added counted', async () => {
    const address = (length: number) =>
      `noordental.sa/${'a'.repeat(length - 22)}`;
    expect(await failures({ url: address(2048) })).toEqual([]);
    expect(await constraintsOf({ url: address(2049) })).toContain('maxLength');
  });

  it.each([
    ['another scheme', 'ftp://noordental.sa'],
    ['a file', 'file:///etc/passwd'],
    ['a script', 'javascript:alert(1)'],
    ['a local path', '/uploads/logo.png'],
    ['a scheme with no host', 'https://'],
    ['a name with no domain', 'noordental'],
  ])('rejects %s', async (_case, url) => {
    expect(await constraintsOf({ url })).toContain('isUrl');
  });

  it.each([
    ['missing', {}],
    ['empty', { url: '' }],
    ['only spaces', { url: '   ' }],
    ['not a string', { url: 42 }],
  ])('rejects an address that is %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('url');
  });
});

// A logo link is one the lookup answered, which is always an absolute http(s)
// link in lower case, so no domain is completed and nothing else is taken.
describe.each([
  ['BrandWebsiteColoursDto', BrandWebsiteColoursDto, {}],
  ['BrandKitFromWebsiteDto', BrandKitFromWebsiteDto, { colours: [] }],
])('%s logo', (_name, dto, rest) => {
  const { failures, constraintsOf } = validating(dto);

  it.each([
    ['an https link', 'https://cdn.noordental.sa/img/logo.svg?v=2'],
    ['an http link', 'http://noordental.sa/logo.png'],
  ])('accepts %s', async (_case, logo) => {
    expect(await failures({ ...rest, logo })).toEqual([]);
  });

  it('accepts 2,048 characters and rejects 2,049', async () => {
    const link = (length: number) =>
      `https://cdn.noordental.sa/${'a'.repeat(length - 30)}.png`;
    expect(await failures({ ...rest, logo: link(2048) })).toEqual([]);
    expect(await constraintsOf({ ...rest, logo: link(2049) })).toContain(
      'maxLength'
    );
  });

  it.each([
    ['a bare domain', 'cdn.noordental.sa/logo.png'],
    ['a local path', '/uploads/logo.png'],
    ['a path that climbs', '../../etc/passwd'],
    ['a file', 'file:///etc/passwd'],
    ['a data link', 'data:image/png;base64,iVBORw0KGgo='],
    ['another scheme', 'ftp://cdn.noordental.sa/logo.png'],
  ])('rejects %s', async (_case, logo) => {
    expect(await failures({ ...rest, logo })).toContain('logo');
  });

  // readOrFetch tells a link from a path by a lower-case "http"
  it('rejects a link whose scheme is in capitals', async () => {
    expect(
      await constraintsOf({ ...rest, logo: 'HTTPS://cdn.noordental.sa/l.png' })
    ).toContain('matches');
  });

  it.each([
    ['empty', ''],
    ['not a string', 42],
  ])('rejects a logo that is %s', async (_case, logo) => {
    expect(await failures({ ...rest, logo })).toContain('logo');
  });
});

describe('BrandWebsiteColoursDto', () => {
  it('rejects a body with no logo', async () => {
    expect(await validating(BrandWebsiteColoursDto).failures({})).toContain(
      'logo'
    );
  });
});

// What the user kept from the card: the logo they picked, if any, and the
// colours they left ticked, merged into the kit by the service.
describe('BrandKitFromWebsiteDto', () => {
  const { failures, constraintsOf } = validating(BrandKitFromWebsiteDto);

  it('accepts the colours with no logo, which leaves the kit’s logo', async () => {
    expect(await failures({ colours: ['#E30613'] })).toEqual([]);
  });

  it('accepts no colours, with a logo', async () => {
    expect(
      await failures({
        logo: 'https://cdn.noordental.sa/logo.png',
        colours: [],
      })
    ).toEqual([]);
  });

  it('accepts six colours, lowercase hex too', async () => {
    expect(await failures({ colours: [...colours(5), '#b5542c'] })).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['null', { colours: null }],
    ['not a list', { colours: '#E30613' }],
  ])('rejects colours that are %s', async (_case, payload) => {
    expect(await failures(payload)).toContain('colours');
  });

  it('rejects a seventh colour', async () => {
    expect(await constraintsOf({ colours: colours(7) })).toContain(
      'arrayMaxSize'
    );
  });

  it('rejects the same colour twice in different cases', async () => {
    expect(await constraintsOf({ colours: ['#e30613', '#E30613'] })).toContain(
      'arrayUnique'
    );
  });

  it.each([
    ['no hash', 'E30613'],
    ['three digits', '#E30'],
    ['a colour name', 'red'],
  ])('rejects a colour with %s', async (_case, colour) => {
    expect(await constraintsOf({ colours: [colour] })).toContain('matches');
  });
});
