// The database module opens a client at import, so only it is swapped out: the
// service reads the kit's fields from the real repository module, and reads and
// writes only through the repository each test hands the rows it holds.
jest.mock('@gitroom/nestjs-libraries/database/prisma/prisma.service', () => ({
  PrismaRepository: class {},
  PrismaTransaction: class {},
}));

import { HttpException } from '@nestjs/common';
import { BrandService } from './brand.service';
import { BrandKitDto } from '@gitroom/nestjs-libraries/dtos/brands/brand.dto';

const stored = {
  logoId: 'logo-1',
  exampleIds: ['example-1', 'example-2'],
  colours: ['#B5542C', '#1F3A5F'],
  headingFont: 'Amiri',
  bodyFont: 'IBM Plex Sans Arabic',
};

const rawda = { id: 'brand-1', name: 'Rawda', brandKit: stored };

const live = (id: string) => ({
  id,
  path: `https://uploads.example.com/${id}.png`,
  deletedAt: null as Date | null,
  type: 'image',
});
const deleted = (id: string) => ({ ...live(id), deletedAt: new Date() });
const video = (id: string) => ({ ...live(id), type: 'video' });

const image = (id: string) => ({
  id,
  path: `https://uploads.example.com/${id}.png`,
  missing: false,
});

const makeService = (repository: Record<string, jest.Mock> = {}) => {
  const mocks = {
    list: jest.fn().mockResolvedValue([]),
    findLive: jest.fn().mockResolvedValue(rawda),
    mediaByIds: jest
      .fn()
      .mockResolvedValue([
        live('logo-1'),
        live('example-1'),
        live('example-2'),
      ]),
    countLive: jest.fn().mockResolvedValue(0),
    findLiveByName: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'brand-1' }),
    softDelete: jest.fn().mockResolvedValue({ id: 'brand-1' }),
    upsertKit: jest.fn().mockResolvedValue(stored),
    customerIdsOfChannels: jest.fn().mockResolvedValue([]),
    ...repository,
  };
  const service = new BrandService(
    mocks as unknown as ConstructorParameters<typeof BrandService>[0]
  );

  return { service, repository: mocks };
};

// The refusal, or undefined when the call went through
const failure = (pending: Promise<unknown>) =>
  pending.then(
    () => undefined,
    (err: unknown) => err as HttpException
  );

describe('BrandService.list', () => {
  // An image deleted elsewhere stays in the kit, shown as missing (FR-012, R5)
  it('returns each brand with its kit, an image deleted from Media missing with its path and one gone from the library missing with none', async () => {
    const { service } = makeService({
      list: jest
        .fn()
        .mockResolvedValue([
          rawda,
          { id: 'brand-2', name: 'Sanabel', brandKit: null },
        ]),
      mediaByIds: jest
        .fn()
        .mockResolvedValue([live('logo-1'), deleted('example-1')]),
    });

    await expect(service.list('org-1')).resolves.toEqual([
      {
        id: 'brand-1',
        name: 'Rawda',
        kit: {
          logo: image('logo-1'),
          examples: [
            { ...image('example-1'), missing: true },
            { id: 'example-2', path: null, missing: true },
          ],
          colours: ['#B5542C', '#1F3A5F'],
          headingFont: 'Amiri',
          bodyFont: 'IBM Plex Sans Arabic',
        },
      },
      {
        id: 'brand-2',
        name: 'Sanabel',
        kit: {
          logo: null,
          examples: [],
          colours: [],
          headingFont: null,
          bodyFont: null,
        },
      },
    ]);
  });

  it("reads every kit's images in one query, however many brands there are", async () => {
    const mediaByIds = jest.fn().mockResolvedValue([]);
    const { service } = makeService({
      list: jest.fn().mockResolvedValue([
        rawda,
        {
          id: 'brand-2',
          name: 'Sanabel',
          brandKit: { ...stored, logoId: 'logo-2', exampleIds: ['example-3'] },
        },
      ]),
      mediaByIds,
    });

    await service.list('org-1');

    expect(mediaByIds).toHaveBeenCalledTimes(1);
    const [org, ids] = mediaByIds.mock.calls[0];
    expect(org).toBe('org-1');
    expect([...ids].sort()).toEqual([
      'example-1',
      'example-2',
      'example-3',
      'logo-1',
      'logo-2',
    ]);
  });
});

describe('BrandService.create', () => {
  it('refuses a name a live brand of the organization already has, with a 400, and creates nothing', async () => {
    const { service, repository } = makeService({
      findLiveByName: jest.fn().mockResolvedValue({ id: 'brand-9' }),
    });

    const err = await failure(service.create('org-1', { name: 'Rawda' }));

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe('A brand with this name already exists');
    expect(repository.findLiveByName).toHaveBeenCalledWith('org-1', 'Rawda');
    expect(repository.create).not.toHaveBeenCalled();
  });

  // The first-brand move only (data-model, State changes)
  it.each([
    ['asked for the first brand', true, 0, true],
    ['asked once the organization has a live brand', true, 1, false],
    ['not asked', undefined, 0, false],
  ])(
    'moves the channels with no brand into it only when %s, and returns its id',
    async (_when, moveUngrouped, liveBrands, moved) => {
      const { service, repository } = makeService({
        countLive: jest.fn().mockResolvedValue(liveBrands),
      });

      await expect(
        service.create('org-1', { name: 'Rawda', moveUngrouped })
      ).resolves.toEqual({ id: 'brand-1' });
      expect(repository.create).toHaveBeenCalledWith('org-1', 'Rawda', moved);
    }
  );
});

describe('BrandService.remove', () => {
  it("404s on an id that isn't a live brand of the organization, and deletes nothing", async () => {
    const { service, repository } = makeService({
      findLive: jest.fn().mockResolvedValue(null),
    });

    const err = await failure(service.remove('org-1', 'brand-9'));

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
    expect(repository.findLive).toHaveBeenCalledWith('org-1', 'brand-9');
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('soft-deletes the brand and returns its id', async () => {
    const { service, repository } = makeService();

    await expect(service.remove('org-1', 'brand-1')).resolves.toEqual({
      id: 'brand-1',
    });
    expect(repository.softDelete).toHaveBeenCalledWith('org-1', 'brand-1');
  });
});

// Two members editing different parts of one kit don't overwrite each other
// (spec, Edge Cases): only the fields sent reach the database.
describe('BrandService.saveKit', () => {
  it('saves colours alone, leaving the logo, the examples and the fonts as stored, and returns the saved brand', async () => {
    const saved = { ...stored, colours: ['#2E7D5B'] };
    const { service, repository } = makeService({
      upsertKit: jest.fn().mockResolvedValue(saved),
    });

    await expect(
      service.saveKit('org-1', 'brand-1', { colours: ['#2E7D5B'] })
    ).resolves.toEqual({
      id: 'brand-1',
      name: 'Rawda',
      kit: {
        logo: image('logo-1'),
        examples: [image('example-1'), image('example-2')],
        colours: ['#2E7D5B'],
        headingFont: 'Amiri',
        bodyFont: 'IBM Plex Sans Arabic',
      },
    });
    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      colours: ['#2E7D5B'],
    });
  });

  it('stores colours uppercase', async () => {
    const { service, repository } = makeService();

    await service.saveKit('org-1', 'brand-1', {
      colours: ['#b5542c', '#1f3A5f'],
    });

    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      colours: ['#B5542C', '#1F3A5F'],
    });
  });

  // The global ValidationPipe has no whitelist, so a body keeps keys the DTO
  // doesn't declare; none of them may reach the kit's row.
  it("passes on none of the body's keys but the kit's own", async () => {
    const { service, repository } = makeService();

    await service.saveKit('org-1', 'brand-1', {
      colours: ['#2E7D5B'],
      customerId: 'brand-9',
      id: 'kit-9',
    } as BrandKitDto);

    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      colours: ['#2E7D5B'],
    });
  });

  it('clears the logo and a font with null', async () => {
    const { service, repository } = makeService();

    await service.saveKit('org-1', 'brand-1', {
      logoId: null,
      headingFont: null,
    });

    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      logoId: null,
      headingFont: null,
    });
  });

  it("404s on an id that isn't a live brand of the organization, and saves nothing", async () => {
    const { service, repository } = makeService({
      findLive: jest.fn().mockResolvedValue(null),
    });

    const err = await failure(
      service.saveKit('org-1', 'brand-9', { colours: ['#2E7D5B'] })
    );

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
    expect(repository.findLive).toHaveBeenCalledWith('org-1', 'brand-9');
    expect(repository.upsertKit).not.toHaveBeenCalled();
  });

  // Replacing one missing image keeps the other missing tiles (FR-012): an
  // image already in the kit is saved again even when it's missing.
  it('keeps an example already in the kit that is missing from Media, beside a new live one', async () => {
    const { service, repository } = makeService({
      mediaByIds: jest
        .fn()
        .mockResolvedValue([
          live('logo-1'),
          deleted('example-2'),
          live('example-3'),
        ]),
      upsertKit: jest.fn().mockResolvedValue({
        ...stored,
        exampleIds: ['example-3', 'example-2'],
      }),
    });

    const brand = await service.saveKit('org-1', 'brand-1', {
      exampleIds: ['example-3', 'example-2'],
    });

    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      exampleIds: ['example-3', 'example-2'],
    });
    expect(brand.kit.examples).toEqual([
      image('example-3'),
      { ...image('example-2'), missing: true },
    ]);
  });

  it('keeps the logo already in the kit when it is sent again though gone from the library', async () => {
    const { service, repository } = makeService({
      mediaByIds: jest.fn().mockResolvedValue([]),
    });

    const brand = await service.saveKit('org-1', 'brand-1', {
      logoId: 'logo-1',
    });

    expect(repository.upsertKit).toHaveBeenCalledWith('brand-1', {
      logoId: 'logo-1',
    });
    expect(brand.kit.logo).toEqual({ id: 'logo-1', path: null, missing: true });
  });

  // An image not yet in this kit must be a live item of the organization:
  // mediaByIds reads only the organization's rows, so another organization's
  // item comes back as no row at all.
  describe.each([
    ["gone from the library, or another organization's", []],
    [
      'deleted from Media',
      [deleted('media-9'), live('logo-1'), live('example-1')],
    ],
  ])('with an image %s', (_how, rows) => {
    it.each([
      ['logoId', { logoId: 'media-9' }],
      ['exampleIds', { exampleIds: ['example-1', 'media-9'] }],
    ])(
      '404s naming %s, and saves nothing',
      async (field, body: BrandKitDto) => {
        const mediaByIds = jest.fn().mockResolvedValue(rows);
        const { service, repository } = makeService({ mediaByIds });

        const err = await failure(service.saveKit('org-1', 'brand-1', body));

        expect(err).toBeInstanceOf(HttpException);
        expect(err.getStatus()).toBe(404);
        expect(err.message).toContain(field);
        expect(mediaByIds).toHaveBeenCalledWith(
          'org-1',
          expect.arrayContaining(['media-9'])
        );
        expect(repository.upsertKit).not.toHaveBeenCalled();
      }
    );
  });

  // Media holds videos too, and a kit's images go to the image model
  it.each([
    ['logoId', { logoId: 'media-9' }],
    ['exampleIds', { exampleIds: ['example-1', 'media-9'] }],
  ])(
    "400s naming %s for a Media item that isn't an image, and saves nothing",
    async (field, body: BrandKitDto) => {
      const { service, repository } = makeService({
        mediaByIds: jest
          .fn()
          .mockResolvedValue([
            live('logo-1'),
            live('example-1'),
            video('media-9'),
          ]),
      });

      const err = await failure(service.saveKit('org-1', 'brand-1', body));

      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(400);
      expect(err.message).toBe(`${field} must be an image`);
      expect(repository.upsertKit).not.toHaveBeenCalled();
    }
  );
});

// Every image render asks for the kit; an image deleted from Media is skipped,
// never refused (FR-012, C5).
describe('BrandService.kitFor', () => {
  // An example keeps its number on the Brands page, a missing one counted, so
  // a refusal can say which it is
  it("gives the brand's name and words and only its live images, in order, each example with its number", async () => {
    const { service, repository } = makeService({
      findLive: jest.fn().mockResolvedValue({
        ...rawda,
        brandKit: {
          ...stored,
          exampleIds: ['example-1', 'example-2', 'example-3'],
        },
      }),
      mediaByIds: jest
        .fn()
        .mockResolvedValue([
          live('logo-1'),
          deleted('example-1'),
          live('example-3'),
          live('example-2'),
        ]),
    });

    await expect(service.kitFor('org-1', 'brand-1')).resolves.toEqual({
      name: 'Rawda',
      logoId: 'logo-1',
      examples: [
        { id: 'example-2', n: 2 },
        { id: 'example-3', n: 3 },
      ],
      colours: ['#B5542C', '#1F3A5F'],
      headingFont: 'Amiri',
      bodyFont: 'IBM Plex Sans Arabic',
    });
    expect(repository.findLive).toHaveBeenCalledWith('org-1', 'brand-1');
    expect(repository.list).not.toHaveBeenCalled();
  });

  it.each([
    ['deleted from Media', [deleted('logo-1')]],
    ['gone from the library', []],
  ])('leaves out a logo %s', async (_how, rows) => {
    const { service } = makeService({
      mediaByIds: jest.fn().mockResolvedValue(rows),
    });

    const kit = await service.kitFor('org-1', 'brand-1');

    expect(kit.logoId).toBeUndefined();
    expect(kit.examples).toEqual([]);
  });

  it('gives the name alone for a brand with no kit', async () => {
    const { service } = makeService({
      findLive: jest.fn().mockResolvedValue({ ...rawda, brandKit: null }),
    });

    await expect(service.kitFor('org-1', 'brand-1')).resolves.toEqual({
      name: 'Rawda',
      examples: [],
      colours: [],
    });
  });

  // Coded, so the AI image dialog can say it in its own words; Samy reads the
  // message.
  it("404s for an id that isn't a live brand of the organization", async () => {
    const { service, repository } = makeService({
      findLive: jest.fn().mockResolvedValue(null),
    });

    const err = await failure(service.kitFor('org-1', 'brand-9'));

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(404);
    expect(err.message).toBe(
      'That brand no longer exists. Pick another or No brand.'
    );
    expect(err.getResponse()).toEqual({
      message: 'That brand no longer exists. Pick another or No brand.',
      code: 'brand_missing',
    });
    expect(repository.mediaByIds).not.toHaveBeenCalled();
  });
});

// Samy's brand for one image, in FR-017's order (data-model, R8). A refusal is
// words for Samy, with the names as stored and in the list's order.
describe('BrandService.resolveForSamy', () => {
  // Sorted by name, as the repository lists them
  const brands = [
    rawda,
    { id: 'brand-2', name: 'Sanabel', brandKit: null },
    { id: 'brand-3', name: 'نخيل', brandKit: null },
  ];

  const resolver = (repository: Record<string, jest.Mock> = {}) =>
    makeService({ list: jest.fn().mockResolvedValue(brands), ...repository });

  // The brand chip's choice comes first, checked against the brand list read
  // for the steps below (R14): none, each or a live brand of the organization.
  // One deleted after the check is refused by kitFor before any render.
  describe('with the brand chip', () => {
    it.each([
      ["another brand's name", 'Sanabel'],
      ['no name', undefined],
    ])(
      'goes without a kit for none, whatever the channels, given %s, and reads nothing',
      async (_gives, input) => {
        const { service, repository } = resolver({
          customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-1']),
        });

        await expect(
          service.resolveForSamy('org-1', {
            chip: 'none',
            input,
            channelIds: ['int-1'],
          })
        ).resolves.toEqual({});
        expect(repository.list).not.toHaveBeenCalled();
        expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
      }
    );

    it.each([
      ["another brand's name", 'Sanabel'],
      ["'none'", 'none'],
      ['no name', undefined],
    ])(
      'takes the live brand it holds over the channels, given %s, reading only the brand list',
      async (_gives, input) => {
        const { service, repository } = resolver({
          customerIdsOfChannels: jest
            .fn()
            .mockResolvedValue(['brand-1', 'brand-2']),
        });

        await expect(
          service.resolveForSamy('org-1', {
            chip: 'brand-3',
            input,
            channelIds: ['int-1', 'int-2'],
          })
        ).resolves.toEqual({ brandId: 'brand-3' });
        expect(repository.list).toHaveBeenCalledTimes(1);
        expect(repository.list).toHaveBeenCalledWith('org-1');
        expect(repository.findLive).not.toHaveBeenCalled();
        expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
      }
    );

    // The browser sends what it holds, so the chip may name another
    // organization's brand, one deleted since it was picked, or nothing at all
    const notLive = [
      [
        "another organization's or a deleted brand",
        'c2b8e4f1-5a3d-4e7b-8f90-1d6a2c4e8b35',
      ],
      ["a brand's name rather than its id", 'Sanabel'],
    ];

    it.each(notLive)(
      'takes %s as no chip, leaving the brand to the input',
      async (_what, chip) => {
        const { service, repository } = resolver({
          customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-1']),
        });

        await expect(
          service.resolveForSamy('org-1', {
            chip,
            input: 'نخيل',
            channelIds: ['int-1'],
          })
        ).resolves.toEqual({ brandId: 'brand-3' });
        expect(repository.list).toHaveBeenCalledTimes(1);
        expect(repository.findLive).not.toHaveBeenCalled();
        expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
      }
    );

    it.each(notLive)(
      "takes %s as no chip, going without a kit for 'none'",
      async (_what, chip) => {
        const { service } = resolver({
          customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-1']),
        });

        await expect(
          service.resolveForSamy('org-1', {
            chip,
            input: 'none',
            channelIds: ['int-1'],
          })
        ).resolves.toEqual({});
      }
    );

    it.each(notLive)(
      'takes %s as no chip, leaving the brand to the selected channels',
      async (_what, chip) => {
        const { service, repository } = resolver({
          customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-2']),
        });

        await expect(
          service.resolveForSamy('org-1', { chip, channelIds: ['int-1'] })
        ).resolves.toEqual({ brandId: 'brand-2' });
        expect(repository.list).toHaveBeenCalledTimes(1);
      }
    );

    it.each(notLive)(
      'takes %s as no chip, asking which brand when no channel is selected',
      async (_what, chip) => {
        const { service } = resolver();

        await expect(
          service.resolveForSamy('org-1', { chip, channelIds: [] })
        ).resolves.toEqual({
          error: `This workspace has 3 brands: Rawda, Sanabel, نخيل. Ask the user which brand this image is for, or none, and keep their answer for the rest of the chat.`,
        });
      }
    );

    it('leaves each to the brand the input names', async () => {
      const { service, repository } = resolver({
        customerIdsOfChannels: jest
          .fn()
          .mockResolvedValue(['brand-1', 'brand-3']),
      });

      await expect(
        service.resolveForSamy('org-1', {
          chip: 'each',
          input: 'Sanabel',
          channelIds: ['int-1', 'int-2'],
        })
      ).resolves.toEqual({ brandId: 'brand-2' });
      expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
    });

    // So Samy still asks first, then calls once per brand with its name
    it('leaves each to the selected channels, refusing when they belong to several brands', async () => {
      const { service } = resolver({
        customerIdsOfChannels: jest
          .fn()
          .mockResolvedValue(['brand-3', 'brand-1']),
      });

      await expect(
        service.resolveForSamy('org-1', {
          chip: 'each',
          channelIds: ['int-1', 'int-2'],
        })
      ).resolves.toEqual({
        error: `The selected channels belong to 2 brands: Rawda, نخيل. Tell the user you'll make one image per brand, each in its own look, at one credit each, and wait for a yes. Then call once per brand with brand set to its name.`,
      });
    });

    it('leaves each to the brand of the selected channels when they share exactly one', async () => {
      const { service } = resolver({
        customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-2']),
      });

      await expect(
        service.resolveForSamy('org-1', {
          chip: 'each',
          channelIds: ['int-1'],
        })
      ).resolves.toEqual({ brandId: 'brand-2' });
    });
  });

  // The model may change its case or pad it, as it does a name's
  it.each(['none', 'None', ' NONE '])(
    "goes without a kit for '%s', whatever the channels, and reads nothing",
    async (input) => {
      const { service, repository } = resolver({
        customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-1']),
      });

      await expect(
        service.resolveForSamy('org-1', { input, channelIds: ['int-1'] })
      ).resolves.toEqual({});
      expect(repository.list).not.toHaveBeenCalled();
      expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
    }
  );

  it('takes the brand the input names over the brand of the selected channels', async () => {
    const { service, repository } = resolver({
      customerIdsOfChannels: jest.fn().mockResolvedValue(['brand-1']),
    });

    await expect(
      service.resolveForSamy('org-1', { input: 'نخيل', channelIds: ['int-1'] })
    ).resolves.toEqual({ brandId: 'brand-3' });
    expect(repository.list).toHaveBeenCalledWith('org-1');
    expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
  });

  // The model may change a name's case or pad it
  it('matches a name in another case or with spaces around it', async () => {
    const { service } = resolver();

    await expect(
      service.resolveForSamy('org-1', { input: ' sanabel ', channelIds: [] })
    ).resolves.toEqual({ brandId: 'brand-2' });
  });

  it('takes the exact name when two brands differ only in case, and asks when neither is exact', async () => {
    const { service } = resolver({
      list: jest
        .fn()
        .mockResolvedValue([
          { id: 'brand-4', name: 'RAWDA', brandKit: null },
          rawda,
        ]),
    });

    await expect(
      service.resolveForSamy('org-1', { input: 'Rawda', channelIds: [] })
    ).resolves.toEqual({ brandId: 'brand-1' });
    await expect(
      service.resolveForSamy('org-1', { input: 'rawda', channelIds: [] })
    ).resolves.toEqual({
      error: `There's no brand called "rawda". The brands are: RAWDA, Rawda. Ask the user which one, or none.`,
    });
  });

  it('names every brand when the input names none of them', async () => {
    const { service } = resolver();

    await expect(
      service.resolveForSamy('org-1', { input: 'Rawdah', channelIds: [] })
    ).resolves.toEqual({
      error: `There's no brand called "Rawdah". The brands are: Rawda, Sanabel, نخيل. Ask the user which one, or none.`,
    });
  });

  // The repository leaves out the channels in no brand (FR-017)
  it('takes the brand of the selected channels when they share exactly one', async () => {
    const customerIdsOfChannels = jest.fn().mockResolvedValue(['brand-2']);
    const { service } = resolver({ customerIdsOfChannels });

    await expect(
      service.resolveForSamy('org-1', { channelIds: ['int-1', 'int-2'] })
    ).resolves.toEqual({ brandId: 'brand-2' });
    expect(customerIdsOfChannels).toHaveBeenCalledWith('org-1', [
      'int-1',
      'int-2',
    ]);
  });

  it('refuses when the selected channels belong to several brands, counting and naming them', async () => {
    const { service, repository } = resolver({
      customerIdsOfChannels: jest
        .fn()
        .mockResolvedValue(['brand-3', 'brand-1']),
    });

    await expect(
      service.resolveForSamy('org-1', { channelIds: ['int-1', 'int-2'] })
    ).resolves.toEqual({
      error: `The selected channels belong to 2 brands: Rawda, نخيل. Tell the user you'll make one image per brand, each in its own look, at one credit each, and wait for a yes. Then call once per brand with brand set to its name.`,
    });
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  // Acceptance scenario 5: as today
  it('goes without a kit when every selected channel is in no brand, though the workspace has several', async () => {
    const { service } = resolver({
      customerIdsOfChannels: jest.fn().mockResolvedValue([]),
    });

    await expect(
      service.resolveForSamy('org-1', { channelIds: ['int-1'] })
    ).resolves.toEqual({});
  });

  it('takes the only brand of the workspace when no channel is selected', async () => {
    const { service, repository } = resolver({
      list: jest.fn().mockResolvedValue([rawda]),
    });

    await expect(
      service.resolveForSamy('org-1', { channelIds: [] })
    ).resolves.toEqual({ brandId: 'brand-1' });
    expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
  });

  it('asks which brand, counting and naming them, when no channel is selected and the workspace has several', async () => {
    const { service } = resolver();

    await expect(
      service.resolveForSamy('org-1', { channelIds: [] })
    ).resolves.toEqual({
      error: `This workspace has 3 brands: Rawda, Sanabel, نخيل. Ask the user which brand this image is for, or none, and keep their answer for the rest of the chat.`,
    });
  });

  it.each([
    ['a name', { input: 'Rawda', channelIds: [] }],
    ['channels', { channelIds: ['int-1'] }],
    ['neither', { channelIds: [] }],
  ])(
    'goes without a kit, as today, when the workspace has no brands and the call gives %s',
    async (_gives, request) => {
      const { service, repository } = resolver({
        list: jest.fn().mockResolvedValue([]),
      });

      await expect(service.resolveForSamy('org-1', request)).resolves.toEqual(
        {}
      );
      expect(repository.customerIdsOfChannels).not.toHaveBeenCalled();
    }
  );
});
