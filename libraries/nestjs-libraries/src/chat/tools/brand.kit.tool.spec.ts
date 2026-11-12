// Nothing here reads a brand for real (same shell pattern as
// samy.image.tool.spec): BrandService is a stand-in, while the words the
// module shares with Samy's image tool are its own.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({
    ...jest.requireActual(
      '@gitroom/nestjs-libraries/database/prisma/brands/brand.service'
    ),
    BrandService: class {},
  })
);

import { BrandKitTool } from '@gitroom/nestjs-libraries/chat/tools/brand.kit.tool';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';

const org = { id: 'org-1', name: 'Sharek' };

// The brand in use as summaryForSamy gives it: only the kit's images still in
// Media, each example with its number on the Brands page (a missing first one
// counted), and only the details that are set.
const acme = {
  name: 'Acme',
  logo: { path: 'https://media/logo.png' },
  examples: [
    { n: 2, path: 'https://media/example-2.jpg' },
    { n: 3, path: 'https://media/example-3.jpg' },
  ],
  colours: ['#B3261E', '#FCF9F8'],
  headingFont: 'IBM Plex Sans Arabic',
  bodyFont: 'Noto Naskh Arabic',
  details: { about: 'A bakery in Riyadh.', hashtags: '#Acme #Bakery' },
};

const FAILED =
  "The brand's kit couldn't be read. Say the step failed and offer to try again.";

const makeTool = (summaryForSamy?: jest.Mock) => {
  const brands = {
    summaryForSamy: summaryForSamy ?? jest.fn().mockResolvedValue(acme),
  };
  return {
    tool: new BrandKitTool(brands as any).run() as any,
    brands,
  };
};

const reads = (summary: object) => jest.fn().mockResolvedValue(summary);

// checkAuth only writes to the request context when it finds an authInfo, and
// there is no async-storage context in a unit test, so the organization the tool
// reads back is the one seeded here. The channels are what the browser sent as
// selected, and the brand the chip's choice as the copilot controller kept it,
// each left off when a test sends none.
const context = (integrations?: unknown, brand?: string) => {
  const requestContext = new Map<string, unknown>([
    ['organization', JSON.stringify(org)],
  ]);
  if (integrations !== undefined) {
    requestContext.set('integrations', integrations);
  }
  if (brand !== undefined) {
    requestContext.set('brand', brand);
  }
  return { requestContext } as any;
};

describe('BrandKitTool', () => {
  it('goes by brandKitTool', () => {
    const { tool } = makeTool();

    expect(new BrandKitTool({} as any).name).toBe('brandKitTool');
    expect(tool.id).toBe('brandKitTool');
  });

  // What Nest gives the tool, which a test that builds the tool itself can't
  // see: no MediaService, so it reads no credits and makes nothing.
  it('is given BrandService alone', () => {
    expect(Reflect.getMetadata('design:paramtypes', BrandKitTool)).toEqual([
      BrandService,
    ]);
  });

  // First: in T038's replay Samy twice asked the user questions without
  // looking at the kit
  it('says it costs no credit, that the pictures come after the result in this turn only, to call it first and what it returns', () => {
    const { tool } = makeTool();

    expect(tool.description).toBe(
      "Look at a brand's kit, for no credit. Its logo and example posts reach you as pictures after this result, in this turn only. When asked for an image for a brand that has example posts, or about the brand's look, call it first. Returns { brand, logo, examples: [{ n, path }], colours, headingFont, bodyFont, details }, or { error }."
    );
  });

  it("takes only a brand's name, saying what leaving it out does", () => {
    const { inputSchema } = makeTool().tool;

    expect(Object.keys(inputSchema.shape)).toEqual(['brand']);
    expect(inputSchema.shape.brand.description).toBe(
      "A brand's name. Leave it out for the brand in use."
    );
    expect(inputSchema.safeParse({ brand: 'Acme' }).data.brand).toBe('Acme');
    expect(inputSchema.safeParse({}).data.brand).toBeUndefined();
  });

  // Mastra validates the return against this schema, so without the error field
  // a failure would never reach the model.
  describe('declares', () => {
    const { outputSchema } = makeTool().tool;

    it('the kit and the error it hands back', () => {
      expect(Object.keys(outputSchema.shape).sort()).toEqual([
        'bodyFont',
        'brand',
        'colours',
        'details',
        'error',
        'examples',
        'headingFont',
        'logo',
      ]);
      expect(outputSchema.safeParse({ error: 'no' }).success).toBe(true);
    });

    it('the logo as a path, and each example as its number and its path', () => {
      const example = outputSchema.shape.examples.unwrap().element;

      expect(Object.keys(example.shape).sort()).toEqual(['n', 'path']);
      expect(
        outputSchema.safeParse({ logo: { path: 'https://media/logo.png' } })
          .success
      ).toBe(false);
      expect(
        outputSchema.safeParse({
          examples: [{ n: '2', path: 'https://media/example-2.jpg' }],
        }).success
      ).toBe(false);
    });

    it('the colours as a list, and the fonts as names', () => {
      expect(outputSchema.safeParse({ colours: '#B3261E' }).success).toBe(
        false
      );
      expect(outputSchema.safeParse({ headingFont: ['A'] }).success).toBe(
        false
      );
      expect(outputSchema.safeParse({ bodyFont: ['A'] }).success).toBe(false);
    });

    it('the five details, each as its words', () => {
      const details = outputSchema.shape.details.unwrap();

      expect(Object.keys(details.shape).sort()).toEqual([
        'about',
        'callToAction',
        'hashtags',
        'postLanguage',
        'toneOfVoice',
      ]);
      expect(
        outputSchema.safeParse({ details: { hashtags: ['#Acme'] } }).success
      ).toBe(false);
    });
  });

  // Picked as Samy's image tool picks it: the brand chip's choice as the
  // copilot controller kept it, and only the channels' ids, which the brand
  // service reads again for this organization (research R7).
  describe('reads the brand in use', () => {
    it("for this organization, with the chip's choice, the name and the selected channels' ids", async () => {
      const { tool, brands } = makeTool();

      await tool.execute(
        { brand: 'Acme' },
        context(
          [
            {
              id: 'channel-1',
              identifier: 'instagram',
              additionalSettings: '[]',
            },
            { id: 'channel-2', identifier: 'x', name: 'Acme on X' },
          ],
          'brand-acme'
        )
      );

      expect(brands.summaryForSamy).toHaveBeenCalledTimes(1);
      expect(brands.summaryForSamy).toHaveBeenCalledWith('org-1', {
        chip: 'brand-acme',
        input: 'Acme',
        channelIds: ['channel-1', 'channel-2'],
      });
    });

    // The browser sends them, so nothing about their shape is guaranteed. A
    // channel counts only as Samy's instructions list it, with a text id and
    // identifier.
    it('keeps only the channels Samy is told are selected', async () => {
      const { tool, brands } = makeTool();

      await tool.execute(
        {},
        context([
          { id: 'channel-1', identifier: 'instagram' },
          null,
          { id: 7, identifier: 'x' },
          'channel-2',
          { identifier: 'x' },
          { id: 'channel-3' },
        ])
      );

      expect(brands.summaryForSamy).toHaveBeenCalledWith('org-1', {
        input: undefined,
        channelIds: ['channel-1'],
      });
    });

    it.each([
      ['none were sent', undefined],
      ['they are not a list', { id: 'channel-1' }],
    ])('with no channels when %s', async (_name, integrations) => {
      const { tool, brands } = makeTool();

      await tool.execute({}, context(integrations));

      expect(brands.summaryForSamy).toHaveBeenCalledWith('org-1', {
        input: undefined,
        channelIds: [],
      });
    });

    // checkAuth runs first, as in every tool: the organization it puts on the
    // context is the one read.
    it('for the organization checkAuth puts on the context', async () => {
      const { tool, brands } = makeTool();
      const run = context();
      run.mcp = { extra: { authInfo: { id: 'org-2', name: 'Other' } } };

      await tool.execute({}, run);

      expect(brands.summaryForSamy).toHaveBeenCalledWith(
        'org-2',
        expect.anything()
      );
    });
  });

  // Names as stored, Arabic ones unchanged; the logo and examples as their
  // paths, which SamyImageReader shows as pictures in this turn only (FR-009).
  it.each([
    ['a Latin name', 'Acme'],
    ['an Arabic name', 'مخبز النور'],
  ])("returns %s and the brand's kit", async (_name, name) => {
    const { tool } = makeTool(reads({ ...acme, name }));

    const result = await tool.execute({}, context());

    expect(result).toEqual({
      brand: name,
      logo: 'https://media/logo.png',
      examples: [
        { n: 2, path: 'https://media/example-2.jpg' },
        { n: 3, path: 'https://media/example-3.jpg' },
      ],
      colours: ['#B3261E', '#FCF9F8'],
      headingFont: 'IBM Plex Sans Arabic',
      bodyFont: 'Noto Naskh Arabic',
      details: { about: 'A bakery in Riyadh.', hashtags: '#Acme #Bakery' },
    });
  });

  // Never claims a logo, example post, colour, font or detail the brand
  // doesn't have (FR-008, FR-014).
  it('returns a kit with nothing in it as nothing: no logo, no examples, no colours, no fonts and no details', async () => {
    const { tool } = makeTool(
      reads({ name: 'Bloom', examples: [], colours: [], details: {} })
    );

    expect(await tool.execute({}, context())).toEqual({
      brand: 'Bloom',
      examples: [],
      colours: [],
      details: {},
    });
  });

  // A throw reaches the user as raw error text, and a turn that ends without
  // content poisons the thread, so every failure is data the model can relay.
  describe('hands back, and never throws', () => {
    it.each([
      [
        'no brand is in use',
        { none: true },
        "No brand is in use, so there's no kit to look at. Say so, and tell the user they can pick a brand on the brand chip or set one up on the Brands page.",
      ],
      [
        'the selected channels belong to several brands',
        { several: ['Acme', 'مخبز النور'] },
        "The selected channels belong to 2 brands: Acme, مخبز النور. Call again with brand set to the one you're working on.",
      ],
      [
        'the workspace has several brands and none is picked',
        { ask: ['Acme', 'Bloom', 'مخبز النور'] },
        'This workspace has 3 brands: Acme, Bloom, مخبز النور. Ask the user which brand, or none, then call again with its name.',
      ],
      [
        'no brand has the name',
        { unknown: 'Acne', brands: ['Acme', 'Bloom'] },
        'There\'s no brand called "Acne". The brands are: Acme, Bloom. Ask the user which one, or none.',
      ],
    ])('the words when %s', async (_name, summary, error) => {
      const { tool } = makeTool(reads(summary));

      expect(await tool.execute({}, context())).toEqual({ error });
    });

    describe("when the brand can't be read", () => {
      let logged: jest.SpyInstance;

      beforeEach(() => {
        logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterEach(() => logged.mockRestore());

      it('general words, and the failure in the log', async () => {
        const thrown = new Error('database is down');
        const { tool } = makeTool(jest.fn().mockRejectedValue(thrown));

        expect(await tool.execute({}, context())).toEqual({ error: FAILED });
        expect(logged).toHaveBeenCalledWith('brandKitTool failed:', thrown);
      });

      it('the same with no organization to read', async () => {
        const { tool, brands } = makeTool();

        const result = await tool.execute({}, {
          requestContext: new Map(),
        } as any);

        expect(result).toEqual({ error: FAILED });
        expect(brands.summaryForSamy).not.toHaveBeenCalled();
      });
    });
  });
});
