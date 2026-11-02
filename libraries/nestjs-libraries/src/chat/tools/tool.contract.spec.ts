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
// The real services reach for Prisma and the provider SDKs at import; a tool
// only calls them when it runs (the same shell pattern as the tool specs).
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
// The real IntegrationManager imports every social provider, and
// nostr.provider pulls in nostr-tools, which ships ESM that Jest's CommonJS
// transform cannot load. Stubbing the package keeps the real provider list,
// whose identifiers integrationSchema's input describes (as in
// integration.manager.spec).
jest.mock('nostr-tools', () => ({
  getPublicKey: () => '',
  finalizeEvent: () => ({}),
  Relay: class {},
  SimplePool: class {},
}));

import { MCPServer } from '@mastra/mcp';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';

// Every constructor argument gets the same stub; no tool takes more than three
// (IntegrationTriggerTool). The real VideoManager lists the video types this
// install configured, so generateVideoTool's list is pinned to one fake.
const stub = { getAllVideos: () => [{ title: 'Fake Provider' }] };

// Keyed by name, as LoadToolsService.loadTools keys them: the key is the tool
// name a client sees. available() is not applied, so every tool is pinned.
const tools: Record<string, any> = Object.fromEntries(
  toolList.map((Tool) => {
    const instance: AgentToolInterface = new (Tool as any)(stub, stub, stub);
    return [instance.name, instance.run()];
  })
);

const server = new MCPServer({ name: 'Sharek MCP', version: '1.0.0', tools });

describe('the MCP tool contracts', () => {
  // Outside CI mode Jest writes a snapshot it has never seen and passes, so a
  // tool a sync adds would slip through the per-tool cases below
  it('exposes exactly the pinned tools', () => {
    expect(Object.keys(tools).sort()).toEqual([
      'clippingStatusTool',
      'clippingTool',
      'clippingWidgetTicketTool',
      'deletePostTool',
      'generateImageTool',
      'generateVideoOptions',
      'generateVideoTool',
      'groupList',
      'integrationList',
      'integrationSchedulePostTool',
      'integrationSchema',
      'mediaListTool',
      'mediaStatusTool',
      'postSettingsTool',
      'postsListTool',
      'triggerTool',
      'uploadFromUrlTool',
      'uploadWidgetStatusTool',
      'uploadWidgetTicketTool',
      'uploadWidgetTool',
      'videoFunctionTool',
      'videoStatusTool',
    ]);
  });

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
