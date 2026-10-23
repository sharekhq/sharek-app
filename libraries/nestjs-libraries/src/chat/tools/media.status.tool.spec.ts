const mockProcessorEnabled = jest.fn();
// The real factory reaches for the R2 SDK; the tool only asks whether a media processor is
// configured (same shell pattern as generate.image.tool.spec).
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { processorEnabled: () => mockProcessorEnabled() },
}));
// The real MediaService reaches Prisma and the storage at import; only the call the tool makes is
// under test.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
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

beforeEach(() => {
  mockProcessorEnabled.mockReset();
});

describe('MediaStatusTool', () => {
  // Without a media processor nothing is ever adjusted, so a status tool would
  // only send clients polling for a change that cannot come. Read through the
  // interface, as LoadToolsService does: a tool without available() is offered.
  it.each([
    ['not offered without', false],
    ['offered with', true],
  ])('is %s a media processor', (_name, enabled) => {
    mockProcessorEnabled.mockReturnValue(enabled);
    const tool: AgentToolInterface = makeTool();

    expect(tool.available?.()).toBe(enabled);
  });

  it('points to the Sharek CLI and never sends the model into a wait loop', () => {
    const { description } = makeTool().run() as unknown as BuiltTool;

    expect(description).toContain('Sharek CLI (sharek upload <file>)');
    expect(description).not.toMatch(/postiz/i);
    expect(description).not.toMatch(/wait about \d+ seconds/);
    expect(description).toContain('check again when they ask');
  });

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
