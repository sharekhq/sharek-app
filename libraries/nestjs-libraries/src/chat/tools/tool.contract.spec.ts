// Every tool the MCP servers expose, pinned the way a client sees it: name,
// description, input and output schema, widget metadata and annotations.
//
// A failure here means a tool's contract changed. Once the ChatGPT plugin is
// published, ChatGPT keeps calling the definition OpenAI approved until it
// approves the change, so before updating the snapshot (-u), make sure the old
// inputs still work, then rescan the server in the OpenAI portal.

// The real factory reaches for the R2 SDK and its env; pinned off so no
// machine's storage or RunPod settings change what is snapshotted.
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({}),
    processorEnabled: () => false,
    clippingEnabled: () => false,
  },
}));
// The services reach for Prisma and the provider SDKs at import; a tool only
// calls them when it runs (the same shell pattern as the tool specs).
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service',
  () => ({ ClippingService: class {} })
);
// It imports every social provider and their SDKs, several ESM-only.
// integrationSchema lists the provider identifiers in a description, so the
// list is a stub: a sync that adds a provider changes that text, not an input.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
  socialIntegrationList: [{ identifier: 'example-provider' }],
}));

import { MCPServer } from '@mastra/mcp';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';

// Every constructor argument gets the same stub: the only dependency read
// while a definition is built is the video titles generateVideoTool lists.
const stub = { getAllVideos: () => [{ title: 'Example video' }] };

// Keyed by name, as LoadToolsService.loadTools keys them: the key is the tool
// name a client sees. available() is not applied, so every tool is pinned.
const tools: Record<string, any> = Object.fromEntries(
  toolList.map((Tool) => {
    const build = Tool as new (...deps: unknown[]) => AgentToolInterface;
    const instance = new build(...new Array(Tool.length).fill(stub));
    return [instance.name, instance.run()];
  })
);

const server = new MCPServer({ name: 'Sharek MCP', version: '1.0.0', tools });

describe('the MCP tool contracts', () => {
  it.each(Object.keys(tools))('%s keeps its contract', async (name) => {
    const { tools: listed } = await server.getToolListInfo();
    const { description, inputSchema, outputSchema, _meta } = listed.find(
      (tool) => tool.name === name
    )!;

    expect({
      name,
      description,
      inputSchema,
      outputSchema,
      _meta,
      annotations: tools[name].mcp?.annotations,
    }).toMatchSnapshot();
  });
});
