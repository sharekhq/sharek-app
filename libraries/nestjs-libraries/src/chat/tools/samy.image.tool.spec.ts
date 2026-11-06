// Nothing here renders or uploads for real (same shell pattern as
// generate.image.tool.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
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

const makeTool = (generateImageFromLinks?: jest.Mock) => {
  const media = {
    generateImageFromLinks:
      generateImageFromLinks ?? jest.fn().mockResolvedValue(made),
  };
  return { tool: new SamyImageTool(media as any).run() as any, media };
};

// checkAuth only writes to the request context when it finds an authInfo, and
// there is no async-storage context in a unit test, so the organization the tool
// reads back is the one seeded here.
const context = () =>
  ({
    requestContext: new Map<string, string>([
      ['organization', JSON.stringify(org)],
    ]),
  } as any);

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

    expect(new SamyImageTool({} as any).name).toBe('generateImageTool');
    expect(tool.id).toBe('generateImageTool');
  });

  it('says what it does, what it returns and that the chat shows the image', () => {
    const { tool } = makeTool();

    expect(tool.description).toBe(
      "Make an image and save it to the Media library, for one image credit. Returns { id, path }, or { error } when it couldn't be made. The chat shows the image by itself."
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

    it('no style, which stays in the prompt', () => {
      expect(Object.keys(makeTool().tool.inputSchema.shape).sort()).toEqual([
        'aspectRatio',
        'editOf',
        'prompt',
        'references',
      ]);
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
      'error',
      'id',
      'path',
    ]);
    expect(tool.outputSchema.safeParse({ error: 'no' }).success).toBe(true);
    expect(tool.outputSchema.safeParse(made).success).toBe(true);
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
