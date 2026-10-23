const mockProcessorEnabled = jest.fn();
// The tool asks the factory whether a media processor is configured; the
// real factory reaches for the R2 SDK.
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { processorEnabled: () => mockProcessorEnabled() },
}));
// The real MediaService constructs the upload factory at import (R2 SDK).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);

import { RequestContext } from '@mastra/core/di';
import { z } from 'zod';
import { UploadFromUrlTool } from '@gitroom/nestjs-libraries/chat/tools/upload.from.url.tool';
import { UploadWidgetTool } from '@gitroom/nestjs-libraries/chat/tools/upload.widget.tool';
import { UploadWidgetStatusTool } from '@gitroom/nestjs-libraries/chat/tools/upload.widget.status.tool';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

const CLI = 'Sharek CLI (sharek upload <file>';
const CLI_DOCS = 'https://docs.sharek.app/cli/introduction';
const API_DOCS = 'https://docs.sharek.app/api/introduction';

const context = () => {
  const requestContext = new RequestContext();
  requestContext.set(
    'organization' as never,
    JSON.stringify({ id: 'org-1', name: 'Sharek' }) as never
  );
  return { requestContext };
};

// Mastra types the built tool's schema as a standard schema; underneath it is
// the zod object the tool declares.
type BuiltTool = {
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (
    input: { url: string; adjust?: boolean },
    ctx: ReturnType<typeof context>
  ) => Promise<{ error?: string }>;
};

const fromUrl = (uploadFromUrl: jest.Mock = jest.fn()) =>
  new UploadFromUrlTool({
    uploadFromUrl,
  } as unknown as MediaService).run() as unknown as BuiltTool;

// An AI client told to attach a file the URL tool cannot fetch reads these
// texts to find another way in: Sharek's own CLI and public upload endpoint.
describe('the upload tools send private files to Sharek', () => {
  it('in the URL tool description', () => {
    const { description } = fromUrl();

    expect(description).toContain(CLI);
    expect(description).toContain(CLI_DOCS);
    expect(description).toContain(API_DOCS);
    expect(description).not.toMatch(/postiz/i);
  });

  it('in the URL parameter', () => {
    const { description } = fromUrl().inputSchema.shape.url;

    expect(description).toContain(CLI);
    expect(description).not.toMatch(/postiz/i);
  });

  it('in the error a failed fetch hands back', async () => {
    const tool = fromUrl(jest.fn().mockRejectedValue(new Error('fetch failed')));

    const { error } = await tool.execute(
      { url: 'https://files.example.com/a.png' },
      context()
    );

    expect(error).toContain('Failed to upload media from URL: fetch failed');
    expect(error).toContain(CLI);
    expect(error).toContain(CLI_DOCS);
    expect(error).toContain(API_DOCS);
    expect(error).not.toMatch(/postiz/i);
  });

  it('in the upload widget description', () => {
    const { description } = new UploadWidgetTool(
      {} as MediaService
    ).run();

    expect(description).toContain(CLI);
    expect(description).toContain(CLI_DOCS);
    expect(description).toContain(API_DOCS);
    expect(description).not.toMatch(/postiz/i);
  });
});

describe('adjusting media, offered only with a media processor', () => {
  it('has no adjust option, and says nothing about adjusting, while the processor is off', () => {
    mockProcessorEnabled.mockReturnValue(false);
    const tool = fromUrl();

    expect(Object.keys(tool.inputSchema.shape)).toEqual(['url']);
    expect(tool.description).not.toMatch(/adjust/i);
    expect(tool.description).not.toContain('mediaStatusTool');
  });

  it('offers adjust and passes it to the upload while the processor is on', async () => {
    mockProcessorEnabled.mockReturnValue(true);
    const uploadFromUrl = jest
      .fn()
      .mockResolvedValue({ id: 'm1', path: 'https://media/a.mp4', status: 'processing' });
    const tool = fromUrl(uploadFromUrl);

    expect(Object.keys(tool.inputSchema.shape)).toEqual(['url', 'adjust']);
    await tool.execute(
      { url: 'https://files.example.com/a.mp4', adjust: true },
      context()
    );
    expect(uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://files.example.com/a.mp4',
      true
    );
  });

  // mcpOnly: the apps that show the widget read it after the user uploads.
  it('lists widget uploads without a wait loop, a pointer to a tool that is not offered, or the upstream product', () => {
    const { description } = new UploadWidgetStatusTool(
      {} as MediaService
    ).run() as unknown as { description: string };

    expect(description).toContain('Sharek CLI (sharek upload <file>)');
    expect(description).not.toMatch(/postiz/i);
    expect(description).not.toMatch(/wait about \d+ seconds/);
    expect(description).not.toContain('mediaStatusTool');
  });
});
