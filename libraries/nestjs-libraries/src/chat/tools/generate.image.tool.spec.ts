// The tool builds a storage client at construction and the real factory reaches
// for the R2 SDK and its env; nothing here uploads for real (same shell pattern
// as media.service.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { GenerateImageTool } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const org = { id: 'org-1', name: 'Sharek' };

const savedMedia = { id: 'media-1', path: 'https://media/abc.png' };

const makeTool = (over: { generateImage?: any } = {}) => {
  const media = {
    generateImage:
      over.generateImage ?? jest.fn().mockResolvedValue('IMAGEB64'),
    saveFile: jest.fn().mockResolvedValue(savedMedia),
  };
  const service = new GenerateImageTool(media as any);
  const storage = {
    uploadSimple: jest.fn().mockResolvedValue('https://media/abc.png'),
  };
  (service as any).storage = storage;
  return { tool: service.run() as any, media, storage };
};

// checkAuth only writes to the request context when it finds an authInfo, and
// there is no async-storage context in a unit test — so the organization the
// tool reads back is the one seeded here.
const context = () =>
  ({
    requestContext: new Map<string, string>([
      ['organization', JSON.stringify(org)],
    ]),
  } as any);

const outOfCredits = () =>
  new SubscriptionException({
    action: AuthorizationActions.Create,
    section: Sections.IMAGES_PER_MONTH,
  });

describe('GenerateImageTool', () => {
  it('returns the saved media on success', async () => {
    const { tool, media, storage } = makeTool();

    const result = await tool.execute({ prompt: 'a pomegranate' }, context());

    expect(media.generateImage).toHaveBeenCalledWith('a pomegranate', org);
    expect(storage.uploadSimple).toHaveBeenCalledWith(
      'data:image/png;base64,IMAGEB64'
    );
    expect(result).toEqual(savedMedia);
  });

  // A thrown error reaches the user as raw error text, and this fork has
  // already paid for the dead-turn class of failure once: a turn that ends
  // without content poisons the thread. The refusal is data the model can act
  // on instead — the shape uploadFromUrlTool already uses for the failures it
  // expects the model to recover from.
  describe('when the image allowance is exhausted', () => {
    it('resolves with an error the model can relay, without throwing', async () => {
      const { tool } = makeTool({
        generateImage: jest.fn().mockRejectedValue(outOfCredits()),
      });

      const result = await tool.execute({ prompt: 'a pomegranate' }, context());

      expect(result.error).toEqual(expect.any(String));
      expect(result.error.toLowerCase()).toContain('image');
      expect(result.id).toBeUndefined();
      expect(result.path).toBeUndefined();
    });

    it('produces no upload and no media row', async () => {
      const { tool, media, storage } = makeTool({
        generateImage: jest.fn().mockRejectedValue(outOfCredits()),
      });

      await tool.execute({ prompt: 'a pomegranate' }, context());

      expect(storage.uploadSimple).not.toHaveBeenCalled();
      expect(media.saveFile).not.toHaveBeenCalled();
    });

    // Mastra validates the return against this schema, so without the widening
    // the refusal never even reaches the model — and the case above would pass
    // while the real tool threw a validation error instead.
    it('declares the error shape on the output schema', () => {
      const { tool } = makeTool();
      const shape = tool.outputSchema.shape;

      expect(Object.keys(shape)).toEqual(
        expect.arrayContaining(['id', 'path', 'error'])
      );
      expect(tool.outputSchema.safeParse({ error: 'no credits' }).success).toBe(
        true
      );
      expect(
        tool.outputSchema.safeParse({ id: 'media-1', path: 'https://media/abc.png' })
          .success
      ).toBe(true);
    });

    // The description is where the model is standing when it reads the result,
    // so a return shape it was never told about is one it has to guess at.
    it('tells the agent an error can come back instead of media', () => {
      expect(makeTool().tool.description).toContain('{ error }');
    });

    // The instruction is not read aloud, but the model echoes its vocabulary:
    // the reported transcript came back with "wait for the allowance to reset",
    // which is this file's word. The limit modal says credits, so this has to
    // as well or Samy and the modal disagree about what ran out (FR-005c).
    it('says credits, the word the rest of the product uses', async () => {
      const { tool } = makeTool({
        generateImage: jest.fn().mockRejectedValue(outOfCredits()),
      });

      const { error } = await tool.execute({ prompt: 'a pomegranate' }, context());

      expect(error).toMatch(/credits/i);
      expect(error).not.toMatch(/allowance/i);
      expect(tool.description).not.toMatch(/allowance/i);
    });
  });

  // Everything else is a real failure — a safety rejection or a provider
  // outage — and the existing tool-error handling is what should see it.
  it('still throws failures that are not a credit refusal', async () => {
    const { tool } = makeTool({
      generateImage: jest.fn().mockRejectedValue(new Error('socket hang up')),
    });

    await expect(
      tool.execute({ prompt: 'a pomegranate' }, context())
    ).rejects.toThrow('socket hang up');
  });
});
