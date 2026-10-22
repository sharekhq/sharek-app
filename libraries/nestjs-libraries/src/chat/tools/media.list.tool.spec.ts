// The real MediaService constructs the upload factory at import, which reaches
// for the R2 SDK and its env; the tool only reads a page of the library.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { RequestContext } from '@mastra/core/di';
import { z } from 'zod';
import { MediaListTool } from '@gitroom/nestjs-libraries/chat/tools/media.list.tool';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

const org = { id: 'org-1', name: 'Sharek' };

// checkAuth only writes to the request context when it finds an authInfo;
// there is none in a unit test, so the organization read back is this one.
const context = () => {
  const requestContext = new RequestContext();
  requestContext.set('organization' as never, JSON.stringify(org) as never);
  return { requestContext };
};

// Mastra types the built tool's schema as a standard schema; underneath it is
// the zod object the tool declares.
type BuiltTool = {
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (
    input: { page?: number; search?: string },
    ctx: ReturnType<typeof context>
  ) => Promise<unknown>;
};

const makeTool = (getMedia?: jest.Mock) => {
  const media = {
    getMedia: getMedia ?? jest.fn().mockResolvedValue({ pages: 0, results: [] }),
  };
  const tool = new MediaListTool(
    media as unknown as MediaService
  ).run() as unknown as BuiltTool;
  return { tool, media };
};

// A row as MediaRepository.getMedia selects it for the dashboard's grid.
const row = {
  id: 'media-1',
  name: 'k2n4x9.png',
  originalName: 'شعار المقهى.png',
  path: 'https://media.sharek.app/k2n4x9.png',
  thumbnail: 'https://media.sharek.app/k2n4x9-thumb.jpg',
  alt: 'The café logo',
  thumbnailTimestamp: 1200,
  createdAt: new Date('2026-10-20T08:30:00.000Z'),
};

describe('MediaListTool', () => {
  // The library pages by MediaRepository's page size, 32 on Sharek (four
  // rows of the grid's eight columns), not upstream's 18; the model plans its
  // paging from what the description says.
  it('tells the model how many items a page holds', () => {
    const { description } = makeTool().tool;

    expect(description).toContain('32 per page');
    expect(description).not.toContain('18 per page');
  });

  it('gives each item only its id, stored name, original filename, address and upload time', async () => {
    const { tool } = makeTool(
      jest.fn().mockResolvedValue({ pages: 1, results: [row] })
    );

    await expect(tool.execute({}, context())).resolves.toEqual({
      pages: 1,
      output: [
        {
          id: 'media-1',
          name: 'k2n4x9.png',
          originalName: 'شعار المقهى.png',
          path: 'https://media.sharek.app/k2n4x9.png',
          createdAt: '2026-10-20T08:30:00.000Z',
        },
      ],
    });
  });

  it('reads the asked page and search of the caller organization, the first page by default', async () => {
    const getMedia = jest.fn().mockResolvedValue({ pages: 0, results: [] });
    const { tool } = makeTool(getMedia);

    await tool.execute({}, context());
    await tool.execute({ page: 3, search: 'logo' }, context());

    expect(getMedia.mock.calls).toEqual([
      ['org-1', 1, undefined],
      ['org-1', 3, 'logo'],
    ]);
  });

  it.each([[0], [-1], [1.5], ['2']])('refuses page %p', (page) => {
    expect(makeTool().tool.inputSchema.safeParse({ page }).success).toBe(false);
  });

  it.each([[{}], [{ page: 1 }], [{ page: 7, search: 'logo' }]])(
    'accepts %p',
    (input) => {
      expect(makeTool().tool.inputSchema.safeParse(input).success).toBe(true);
    }
  );
});
