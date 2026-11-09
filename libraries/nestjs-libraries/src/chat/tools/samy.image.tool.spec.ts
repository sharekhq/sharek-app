// Nothing here renders or uploads for real (same shell pattern as
// generate.image.tool.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
// The brand repository opens a database client at import.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/brands/brand.service',
  () => ({ BrandService: class {} })
);

import { HttpException } from '@nestjs/common';
import { SamyImageTool } from '@gitroom/nestjs-libraries/chat/tools/samy.image.tool';
import { imageCreditRefusal } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_PROMPT_MAX_CHARS,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

const org = { id: 'org-1', name: 'Sharek' };

const made = { id: 'media-1', path: 'https://media/made.jpg' };

const makeTool = (
  generateImageFromLinks?: jest.Mock,
  imageCreditsLeft?: jest.Mock,
  resolveForSamy?: jest.Mock
) => {
  const media = {
    generateImageFromLinks:
      generateImageFromLinks ?? jest.fn().mockResolvedValue(made),
    imageCreditsLeft:
      imageCreditsLeft ?? jest.fn().mockResolvedValue({ credits: Infinity }),
  };
  // No brand unless a test picks one, so the image is made as it always was.
  const brands = {
    resolveForSamy: resolveForSamy ?? jest.fn().mockResolvedValue({}),
  };
  return {
    tool: new SamyImageTool(media as any, brands as any).run() as any,
    media,
    brands,
  };
};

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

const RESETS_AT = '2026-12-01T00:00:00.000Z';

const refusal = (resetsAt?: string) =>
  new SubscriptionException({
    action: AuthorizationActions.Create,
    section: Sections.IMAGES_PER_MONTH,
    ...(resetsAt ? { resetsAt } : {}),
  });

const links = (count: number) =>
  Array.from({ length: count }, (_, index) => `https://media/${index}`);

describe('SamyImageTool', () => {
  it("goes by the outside tool's name, so old and new rows draw the same way", () => {
    const { tool } = makeTool();

    expect(new SamyImageTool({} as any, {} as any).name).toBe(
      'generateImageTool'
    );
    expect(tool.id).toBe('generateImageTool');
  });

  it('says what it does, what it returns, the brand included, and that the chat shows the image', () => {
    const { tool } = makeTool();

    expect(tool.description).toBe(
      "Make an image and save it to the Media library, for one image credit. Returns { id, path }, with brand set to the brand's name when its kit went along, or { error } when it couldn't be made. The chat shows the image by itself."
    );
  });

  describe('takes', () => {
    const parse = (input: object) =>
      makeTool().tool.inputSchema.safeParse({ prompt: 'a cat', ...input });

    it('up to 4 references', () => {
      expect(parse({ references: links(4) }).success).toBe(true);
      expect(parse({ references: links(5) }).success).toBe(false);
    });

    it("a prompt up to the window's limit", () => {
      const atLimit = 'a'.repeat(IMAGE_PROMPT_MAX_CHARS);

      expect(parse({ prompt: atLimit }).success).toBe(true);
      expect(parse({ prompt: `${atLimit}a` }).success).toBe(false);
    });

    it("only the window's shapes", () => {
      for (const aspectRatio of IMAGE_ASPECT_IDS) {
        expect(parse({ aspectRatio }).success).toBe(true);
      }
      expect(parse({ aspectRatio: 'panorama' }).success).toBe(false);
    });

    it('square when no shape is named', () => {
      expect(parse({}).data.aspectRatio).toBe('square');
    });

    it('an image to change', () => {
      expect(parse({ editOf: 'https://media/a' }).data.editOf).toBe(
        'https://media/a'
      );
    });

    // A card takes its shape from this while the arguments stream in, and a long
    // prompt ahead of it left a story's card square for about 2 seconds on the walk.
    it('the shape first, before the prompt', () => {
      expect(Object.keys(makeTool().tool.inputSchema.shape)[0]).toBe(
        'aspectRatio'
      );
    });

    it('no style, which stays in the prompt', () => {
      expect(Object.keys(makeTool().tool.inputSchema.shape).sort()).toEqual([
        'aspectRatio',
        'brand',
        'editOf',
        'prompt',
        'references',
      ]);
    });

    it("a brand's name or 'none', last, saying what leaving it out does", () => {
      const { shape } = makeTool().tool.inputSchema;

      expect(Object.keys(shape).slice(-1)).toEqual(['brand']);
      expect(shape.brand.description).toBe(
        "A brand's name, to use its kit, or 'none' for no brand. Leave it out to use the brand of the selected channels."
      );
      expect(parse({ brand: 'Acme' }).data.brand).toBe('Acme');
      expect(parse({}).data.brand).toBeUndefined();
    });
  });

  it('hands the input to the service for this organization, and returns the image', async () => {
    const { tool, media } = makeTool();

    const result = await tool.execute(
      {
        prompt: 'a model wearing it',
        aspectRatio: 'portrait',
        references: ['https://media/a'],
        editOf: 'https://media/b',
      },
      context()
    );

    expect(media.generateImageFromLinks).toHaveBeenCalledWith(org, {
      prompt: 'a model wearing it',
      aspectRatio: 'portrait',
      references: ['https://media/a'],
      editOf: 'https://media/b',
    });
    expect(result).toEqual(made);
  });

  it('makes a square through the real validation when no shape is named', async () => {
    const { tool, media } = makeTool();

    await tool.execute({ prompt: 'a cat' }, context());

    expect(media.generateImageFromLinks).toHaveBeenCalledWith(
      org,
      expect.objectContaining({ aspectRatio: 'square' })
    );
  });

  // Mastra validates the return against this schema, so without the error field
  // a refusal would never reach the model.
  it('declares the shape every stored row already has', () => {
    const { tool } = makeTool();

    expect(Object.keys(tool.outputSchema.shape).sort()).toEqual([
      'brand',
      'error',
      'id',
      'path',
    ]);
    expect(tool.outputSchema.safeParse({ error: 'no' }).success).toBe(true);
    expect(tool.outputSchema.safeParse(made).success).toBe(true);
  });

  // Samy names the brand in its reply only from this (FR-019).
  it("keeps the brand's name beside the image", () => {
    const named = { ...made, brand: 'Acme' };

    expect(makeTool().tool.outputSchema.parse(named)).toEqual(named);
  });

  // Picked on the server from the brand Samy names and the channels the browser
  // says are selected, so a model that misses a line can't miss the kit
  // (research R8, R9).
  describe('picks the brand', () => {
    const ACME = 'brand-acme';

    const picks = (answer: object) => jest.fn().mockResolvedValue(answer);

    it("asks for this organization's brand with the one named and the selected channels' ids", async () => {
      const { tool, brands } = makeTool();

      await tool.execute(
        { prompt: 'a cat', brand: 'Acme' },
        context([
          {
            id: 'channel-1',
            identifier: 'instagram',
            additionalSettings: '[]',
          },
          { id: 'channel-2', identifier: 'x', name: 'Acme on X' },
        ])
      );

      expect(brands.resolveForSamy).toHaveBeenCalledWith('org-1', {
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
        { prompt: 'a cat' },
        context([
          { id: 'channel-1', identifier: 'instagram' },
          null,
          { id: 7, identifier: 'x' },
          'channel-2',
          { identifier: 'x' },
          { id: 'channel-3' },
        ])
      );

      expect(brands.resolveForSamy).toHaveBeenCalledWith('org-1', {
        input: undefined,
        channelIds: ['channel-1'],
      });
    });

    // The copilot controller keeps only none, each or a live brand id of the
    // organization, so the brand service takes it as it is (research R14).
    it.each([
      ['none', 'none'],
      ['each', 'each'],
      ['a brand', ACME],
    ])(
      "asks with the brand chip's choice, %s, beside the name and the channels",
      async (_name, chip) => {
        const { tool, brands } = makeTool();

        await tool.execute(
          { prompt: 'a cat', brand: 'Bloom' },
          context([{ id: 'channel-1', identifier: 'instagram' }], chip)
        );

        expect(brands.resolveForSamy).toHaveBeenCalledWith('org-1', {
          chip,
          input: 'Bloom',
          channelIds: ['channel-1'],
        });
      }
    );

    it.each([
      ['none were sent', undefined],
      ['they are not a list', { id: 'channel-1' }],
    ])('asks with no channels when %s', async (_name, integrations) => {
      const { tool, brands } = makeTool();

      await tool.execute({ prompt: 'a cat' }, context(integrations));

      expect(brands.resolveForSamy).toHaveBeenCalledWith('org-1', {
        input: undefined,
        channelIds: [],
      });
    });

    it("hands the render the brand's id, not the name Samy gave", async () => {
      const { tool, media } = makeTool(
        undefined,
        undefined,
        picks({ brandId: ACME })
      );

      await tool.execute({ prompt: 'a cat', brand: 'Acme' }, context());

      expect(media.generateImageFromLinks).toHaveBeenCalledWith(org, {
        prompt: 'a cat',
        aspectRatio: 'square',
        brand: ACME,
      });
    });

    it.each([
      ["'none'", 'none'],
      ['no brand', undefined],
    ])(
      'hands the render no brand when none is picked for %s',
      async (_name, brand) => {
        const { tool, media } = makeTool();

        await tool.execute({ prompt: 'a cat', brand }, context());

        expect(
          media.generateImageFromLinks.mock.calls[0][1].brand
        ).toBeUndefined();
      }
    );

    it("returns the brand's name when the render names it", async () => {
      const named = { ...made, brand: 'Acme' };
      const { tool } = makeTool(
        jest.fn().mockResolvedValue(named),
        undefined,
        picks({ brandId: ACME })
      );

      expect(
        await tool.execute({ prompt: 'a cat', brand: 'Acme' }, context())
      ).toEqual(named);
    });

    describe('when it refuses', () => {
      const words =
        'This workspace has 2 brands: Acme, Bloom. Ask the user which brand this image is for, or none, and keep their answer for the rest of the chat.';

      it('hands back its words and makes nothing', async () => {
        const { tool, media } = makeTool(
          undefined,
          undefined,
          picks({ error: words })
        );

        expect(await tool.execute({ prompt: 'a cat' }, context())).toEqual({
          error: words,
        });
        expect(media.generateImageFromLinks).not.toHaveBeenCalled();
      });

      it('reads no credits', async () => {
        const { tool, media } = makeTool(
          undefined,
          undefined,
          picks({ error: words })
        );

        await tool.execute({ prompt: 'a cat' }, context());

        expect(media.imageCreditsLeft).not.toHaveBeenCalled();
      });

      it('gives the slot back', async () => {
        const { tool } = makeTool(
          undefined,
          undefined,
          picks({ error: words })
        );
        const run = context();

        await tool.execute({ prompt: 'a cat' }, run);

        expect(run.requestContext.get('samyImagesMade')).toBe(0);
      });
    });

    it('hands back the words for too many images beside the logo, and gives the slot and credit back', async () => {
      const words =
        "With Acme's logo, only 3 of the user's images fit (2 when editing), so no image was made and no credit was spent. Ask which to keep, or whether to use no brand.";
      const render = jest
        .fn()
        .mockRejectedValueOnce(new HttpException(words, 400))
        .mockResolvedValue(made);
      const { tool } = makeTool(
        render,
        jest.fn().mockResolvedValue({ credits: 1, resetsAt: RESETS_AT }),
        picks({ brandId: ACME })
      );
      const run = context();

      expect(
        await tool.execute(
          { prompt: 'a cat', brand: 'Acme', references: links(4) },
          run
        )
      ).toEqual({ error: words });
      expect(run.requestContext.get('samyImagesMade')).toBe(0);
      expect(await tool.execute({ prompt: 'a cat' }, run)).toEqual(made);
    });

    // The chip's brand is checked when the message is sent, so it may be
    // deleted before the render reads its kit. kitFor's refusal is coded for
    // the AI image dialog; Samy gets its words.
    it("hands back kitFor's words when the chip's brand was deleted since, and gives the slot and credit back", async () => {
      const words = 'That brand no longer exists. Pick another or No brand.';
      const render = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException({ message: words, code: 'brand_missing' }, 404)
        )
        .mockResolvedValue(made);
      const { tool } = makeTool(
        render,
        jest.fn().mockResolvedValue({ credits: 1, resetsAt: RESETS_AT }),
        picks({ brandId: ACME })
      );
      const run = context(undefined, ACME);

      expect(await tool.execute({ prompt: 'a cat' }, run)).toEqual({
        error: words,
      });
      expect(run.requestContext.get('samyImagesMade')).toBe(0);
      expect(await tool.execute({ prompt: 'a cat' }, run)).toEqual(made);
    });

    it("hands back the general words when the brands can't be read, before any credit", async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { tool, media } = makeTool(
        undefined,
        undefined,
        jest.fn().mockRejectedValue(new Error('database is down'))
      );
      const run = context();

      const result = await tool.execute({ prompt: 'a cat' }, run);

      expect(result.error).toMatch(/offer to try again/);
      expect(result.error).not.toContain('database is down');
      expect(media.imageCreditsLeft).not.toHaveBeenCalled();
      expect(media.generateImageFromLinks).not.toHaveBeenCalled();
      expect(run.requestContext.get('samyImagesMade')).toBe(0);
      logged.mockRestore();
    });

    // Dropping it would read the credits again before the first call's usage is
    // written, and spend past them (research R29).
    it("keeps the run's credit read when one call's brands can't be read", async () => {
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      const resolve = jest
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('database is down'))
        .mockResolvedValue({});
      // A fresh answer each read, as the database gives, so a second read
      // would find the credit the first call is spending.
      const { tool, media } = makeTool(
        undefined,
        jest.fn(async () => ({ credits: 1, resetsAt: RESETS_AT })),
        resolve
      );
      const run = context();

      const [first, failed] = await Promise.all([
        tool.execute({ prompt: 'a cat' }, run),
        tool.execute({ prompt: 'a cat' }, run),
      ]);

      expect(first).toEqual(made);
      expect(failed.error).toMatch(/offer to try again/);
      expect(await tool.execute({ prompt: 'a cat' }, run)).toEqual({
        error: imageCreditRefusal(RESETS_AT),
      });
      expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });
  });

  // Enforced rather than instructed, because the model can miss a line. Parallel
  // calls in one step and calls across steps share one request context, and each
  // POST builds a new one (research R10).
  describe('makes at most 4 images in one message', () => {
    const call = { prompt: 'a cat' };

    const isLimit = (result: { error?: string }) =>
      /up to 4/.test(result.error ?? '');

    it('refuses a fifth parallel call, against a slow service', async () => {
      const finish: Array<(value: unknown) => void> = [];
      const slow = jest.fn(
        () => new Promise((resolve) => finish.push(resolve))
      );
      const { tool, media } = makeTool(slow);
      const run = context();

      const results = [1, 2, 3, 4, 5].map(() => tool.execute(call, run));
      // The fifth doesn't wait on anything, so it answers while the rest render.
      expect(isLimit(await results[4])).toBe(true);
      await new Promise((resolve) => setImmediate(resolve));
      finish.forEach((done) => done(made));

      expect(await Promise.all(results.slice(0, 4))).toEqual([
        made,
        made,
        made,
        made,
      ]);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(4);
    });

    it('refuses a fifth call in a later step the same way', async () => {
      const { tool, media } = makeTool();
      const run = context();

      for (let image = 0; image < 4; image++) {
        expect(await tool.execute(call, run)).toEqual(made);
      }

      expect(isLimit(await tool.execute(call, run))).toBe(true);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(4);
    });

    it('says what the model should tell the user, and that nothing was spent', async () => {
      const { tool } = makeTool();
      const run = context();

      for (let image = 0; image < 4; image++) {
        await tool.execute(call, run);
      }

      expect(await tool.execute(call, run)).toEqual({
        error:
          "One message can make up to 4 images, so this one wasn't made and no credit was spent. Tell the user you can make up to 4 at a time.",
      });
    });

    it('asks for no credits once the limit is reached', async () => {
      const { tool, media } = makeTool();
      const run = context();

      for (let image = 0; image < 4; image++) {
        await tool.execute(call, run);
      }
      media.imageCreditsLeft.mockClear();
      await tool.execute(call, run);

      expect(media.imageCreditsLeft).not.toHaveBeenCalled();
    });

    it('gives a slot back when no image came out, so a later call can run', async () => {
      const render = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException('Your request was rejected.', 422)
        )
        .mockResolvedValue(made);
      const { tool, media } = makeTool(render);
      const run = context();

      await tool.execute(call, run);
      for (let image = 0; image < 4; image++) {
        expect(await tool.execute(call, run)).toEqual(made);
      }

      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(5);
      expect(isLimit(await tool.execute(call, run))).toBe(true);
    });

    it('starts again on a new context, as a regenerate does', async () => {
      const { tool } = makeTool();
      const run = context();

      for (let image = 0; image < 5; image++) {
        await tool.execute(call, run);
      }

      expect(await tool.execute(call, context())).toEqual(made);
    });
  });

  // resolveImage checks before useCredit writes its row, and a step's calls run in
  // parallel, so with 2 credits left 3 calls would all pass and all render (research R29).
  describe('spends no more credits than the run started with', () => {
    const call = { prompt: 'a cat' };

    const left = (credits: number, resetsAt?: string) =>
      jest.fn().mockResolvedValue({ credits, resetsAt });

    it('reads the credits once, and refuses the call past them', async () => {
      const { tool, media } = makeTool(undefined, left(2, RESETS_AT));
      const run = context();

      const results = await Promise.all([
        tool.execute(call, run),
        tool.execute(call, run),
        tool.execute(call, run),
      ]);

      expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
      expect(media.imageCreditsLeft).toHaveBeenCalledWith(org);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        made,
        made,
        { error: imageCreditRefusal(RESETS_AT) },
      ]);
    });

    it('says the plan has none when there is no reset date', async () => {
      const { tool, media } = makeTool(undefined, left(0));

      expect(await tool.execute(call, context())).toEqual({
        error: imageCreditRefusal(),
      });
      expect(media.generateImageFromLinks).not.toHaveBeenCalled();
    });

    // A usage row can pass the allowance when two tabs spend together.
    it('reads a count already below zero as none', async () => {
      const { tool, media } = makeTool(undefined, left(-1, RESETS_AT));

      expect(await tool.execute(call, context())).toEqual({
        error: imageCreditRefusal(RESETS_AT),
      });
      expect(media.generateImageFromLinks).not.toHaveBeenCalled();
    });

    it('sets no limit where the service sets none', async () => {
      const { tool, media } = makeTool(undefined, left(Infinity));
      const run = context();

      for (let image = 0; image < 4; image++) {
        expect(await tool.execute(call, run)).toEqual(made);
      }

      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(4);
    });

    it('gives the slot back after a credit refusal', async () => {
      const { tool, media } = makeTool(undefined, left(1, RESETS_AT));
      const run = context();

      await tool.execute(call, run);
      // Had any of these kept its slot, the last would read as the limit of 4.
      for (let refused = 0; refused < 4; refused++) {
        expect(await tool.execute(call, run)).toEqual({
          error: imageCreditRefusal(RESETS_AT),
        });
      }

      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(1);
    });

    it('gives the credit back when no image came out, so a later call can use it', async () => {
      const render = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException('Your request was rejected.', 422)
        )
        .mockResolvedValue(made);
      const { tool, media } = makeTool(render, left(1, RESETS_AT));
      const run = context();

      await tool.execute(call, run);

      expect(await tool.execute(call, run)).toEqual(made);
      expect(await tool.execute(call, run)).toEqual({
        error: imageCreditRefusal(RESETS_AT),
      });
      expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
      expect(media.generateImageFromLinks).toHaveBeenCalledTimes(2);
    });

    it('takes a credit once, however a failed render ended', async () => {
      const render = jest
        .fn()
        .mockRejectedValueOnce(new Error('socket hang up'))
        .mockRejectedValueOnce(refusal(RESETS_AT))
        .mockResolvedValue(made);
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { tool } = makeTool(render, left(1, RESETS_AT));
      const run = context();

      await tool.execute(call, run);
      await tool.execute(call, run);

      expect(await tool.execute(call, run)).toEqual(made);
      expect(await tool.execute(call, run)).toEqual({
        error: imageCreditRefusal(RESETS_AT),
      });
      logged.mockRestore();
    });

    it('hands back the general words when the credits can’t be read, and gives the slot back', async () => {
      const failure = new Error('database is down');
      const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      const { tool, media } = makeTool(
        undefined,
        jest.fn().mockRejectedValue(failure)
      );
      const run = context();

      const results = await Promise.all([
        tool.execute(call, run),
        tool.execute(call, run),
      ]);

      for (const result of results) {
        expect(result.error).toMatch(/offer to try again/);
        expect(result.error).not.toContain('database is down');
      }
      expect(media.imageCreditsLeft).toHaveBeenCalledTimes(1);
      expect(media.generateImageFromLinks).not.toHaveBeenCalled();
      expect(run.requestContext.get('samyImagesMade')).toBe(0);
      logged.mockRestore();
    });
  });

  // One blip reading the credits mustn't fail every image for the rest of the reply.
  it('reads the credits again on a later call, after a read that failed', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    const credits = jest
      .fn()
      .mockRejectedValueOnce(new Error('database is down'))
      .mockResolvedValue({ credits: 1, resetsAt: RESETS_AT });
    const { tool } = makeTool(undefined, credits);
    const run = context();

    const failed = await tool.execute({ prompt: 'a cat' }, run);

    expect(failed.error).toMatch(/offer to try again/);
    expect(await tool.execute({ prompt: 'a cat' }, run)).toEqual(made);
    expect(credits).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  // A throw reaches the user as raw text, and a turn that ends with no content
  // poisons the thread, so every refusal is data the model can put in its own words.
  describe('hands back, and never throws', () => {
    const errorFor = async (thrown: unknown) => {
      const { tool } = makeTool(jest.fn().mockRejectedValue(thrown));
      return tool.execute({ prompt: 'a cat' }, context());
    };

    it("today's text for used-up credits, with the reset date", async () => {
      expect(await errorFor(refusal(RESETS_AT))).toEqual({
        error: imageCreditRefusal(RESETS_AT),
      });
    });

    it("today's text for a plan with no credits", async () => {
      expect(await errorFor(refusal())).toEqual({
        error: imageCreditRefusal(),
      });
    });

    it('a refused reference, with the link it names', async () => {
      const named = new HttpException(
        {
          message:
            'The image https://media/gone is no longer in the Media library.',
          code: 'reference_missing',
          index: 1,
        },
        404
      );

      expect(await errorFor(named)).toEqual({
        error:
          'The image https://media/gone is no longer in the Media library.',
      });
    });

    it("a rendering failure's own words, already written for the user", async () => {
      expect(
        await errorFor(
          new HttpException(
            'Your request was rejected by the AI safety system. Please adjust your prompt and try again.',
            422
          )
        )
      ).toEqual({
        error:
          'Your request was rejected by the AI safety system. Please adjust your prompt and try again.',
      });
    });

    describe('with anything else', () => {
      let logged: jest.SpyInstance;

      beforeEach(() => {
        logged = jest.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterEach(() => logged.mockRestore());

      it('general words, and the failure in the log', async () => {
        const thrown = new Error('socket hang up');

        const result = await errorFor(thrown);

        expect(result.error).toMatch(/no credit was spent/);
        expect(result.error).toMatch(/offer to try again/);
        expect(result.error).not.toContain('socket hang up');
        expect(logged).toHaveBeenCalledWith('samyImageTool failed:', thrown);
      });

      it('the same with no organization to read', async () => {
        const { tool, media } = makeTool();

        const result = await tool.execute({ prompt: 'a cat' }, {
          requestContext: new Map(),
        } as any);

        expect(result.error).toMatch(/offer to try again/);
        expect(media.generateImageFromLinks).not.toHaveBeenCalled();
      });
    });
  });
});
