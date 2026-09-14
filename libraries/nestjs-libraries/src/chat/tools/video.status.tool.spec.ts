// The real MediaService constructs the upload factory at import, which reaches
// for the R2 SDK and its env; the tool only reads a job's status (same shell
// pattern as generate.video.tool.spec).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { HttpException } from '@nestjs/common';
import { VideoStatusTool } from '@gitroom/nestjs-libraries/chat/tools/video.status.tool';

const org = { id: 'org-1', name: 'Sharek' };

const makeTool = (getGenerateVideoStatus?: any) => {
  const media = { getGenerateVideoStatus: getGenerateVideoStatus ?? jest.fn() };
  const tool = new VideoStatusTool(media as any).run() as any;
  return { tool, media };
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

const input = { jobId: 'video_org-1_abcdefghij' };

describe('VideoStatusTool', () => {
  // Upstream's description told the model to wait 30 seconds and call again,
  // which is the in-turn polling the assistant must never do: a render takes
  // minutes and the reply is held open for all of them.
  describe('the description', () => {
    const description = () => makeTool().tool.description as string;

    it('does not send the model into a wait loop', () => {
      expect(description()).not.toMatch(/wait about 30 seconds/);
    });

    it('fires only on a later request from the user', () => {
      expect(description()).toContain('when the user asks');
    });
  });

  it('reports a finished job as the saved media', async () => {
    const { tool } = makeTool(
      jest
        .fn()
        .mockResolvedValue({ status: 'completed', id: 'm1', path: '/x.mp4' })
    );

    await expect(tool.execute(input, context())).resolves.toMatchObject({
      status: 'completed',
      id: 'm1',
      url: '/x.mp4',
    });
  });

  // A lookup failure is data, not a throw: the model has to be able to tell the
  // user the job is gone and offer to start another one.
  it('hands back a lookup failure instead of throwing', async () => {
    const { tool } = makeTool(
      jest.fn().mockRejectedValue(new HttpException('Video job not found', 404))
    );

    await expect(tool.execute(input, context())).resolves.toEqual({
      error: 'Video job lookup failed: Video job not found',
    });
  });
});
