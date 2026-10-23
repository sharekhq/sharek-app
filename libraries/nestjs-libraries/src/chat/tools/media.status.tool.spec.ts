// The real MediaService reaches Prisma and the storage at import; only the call the tool makes is
// under test.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { MediaStatusTool } from '@gitroom/nestjs-libraries/chat/tools/media.status.tool';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

const context = () => ({
  requestContext: new Map<string, string>([
    ['organization', JSON.stringify({ id: 'org-1', name: 'Sharek' })],
  ]),
});

type BuiltTool = {
  description: string;
  execute: (
    input: { id: string },
    ctx: ReturnType<typeof context>
  ) => Promise<Record<string, string>>;
};

const makeTool = (getMediaUploadStatus: jest.Mock = jest.fn()) =>
  new MediaStatusTool({
    getMediaUploadStatus,
  } as unknown as MediaService);

describe('MediaStatusTool', () => {
  it("answers the organization's media status as API clients see it", async () => {
    const getMediaUploadStatus = jest.fn().mockResolvedValue({
      id: 'm1',
      path: 'https://media/x.mp4',
      status: 'ready',
    });
    const tool = makeTool(getMediaUploadStatus).run() as unknown as BuiltTool;

    await expect(tool.execute({ id: 'm1' }, context())).resolves.toEqual({
      id: 'm1',
      path: 'https://media/x.mp4',
      status: 'ready',
    });
    expect(getMediaUploadStatus).toHaveBeenCalledWith('org-1', 'm1');
  });
});
