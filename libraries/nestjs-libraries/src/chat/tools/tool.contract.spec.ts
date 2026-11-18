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
// The relay service only builds tool definitions here; its collaborators (the
// OAuth service, the tool loader, the MCP client and the ssrf-safe fetch) run
// when a self-hosted connection calls a tool, so they are shells.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service',
  () => ({ OAuthService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/chat/load.tools.service', () => ({
  LoadToolsService: class {},
}));
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {},
}));
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {},
  StreamableHTTPError: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ ssrfSafeDispatcher: {} })
);

import { MCPServer } from '@mastra/mcp';
import { McpRelayService } from '@gitroom/nestjs-libraries/chat/mcp.relay.service';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { ChatgptToolsService } from '@gitroom/nestjs-libraries/chat/chatgpt/chatgpt.tools.service';

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

// The Claude connector hides these (claudeHiddenTools in start.mcp.ts); its
// definitions are the full set's, pinned above.
const claudeHiddenTools = [
  'generateImageTool',
  'generateVideoTool',
  'videoStatusTool',
  'generateVideoOptions',
  'videoFunctionTool',
  'clippingTool',
  'clippingStatusTool',
  'clippingWidgetTicketTool',
];

describe('the Claude connection', () => {
  it('exposes exactly the pinned tools', () => {
    expect(
      Object.keys(tools)
        .filter((name) => !claudeHiddenTools.includes(name))
        .sort()
    ).toEqual([
      'deletePostTool',
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
    ]);
  });
});

// What startMcp passes to McpRelayService.tools: the agent's tools, so not the
// ui:// widgets (mcpOnly) and not a tool this install has switched off. The
// pinned storage reports no processor and no clipping.
const agentTools: Record<string, any> = Object.fromEntries(
  toolList
    .map((Tool) => new (Tool as any)(stub, stub, stub) as AgentToolInterface)
    .filter((instance) => !instance.mcpOnly)
    .filter((instance) => !instance.available || instance.available())
    .map((instance) => [instance.name, instance.run()])
);
const selfHostedTools: Record<string, any> = new McpRelayService(
  {} as any,
  {} as any
).tools(agentTools);
const selfHostedServer = new MCPServer({
  name: 'Sharek MCP',
  version: '1.0.0',
  tools: selfHostedTools,
});

describe('the self-hosted connection', () => {
  it('exposes exactly the pinned tools', () => {
    expect(Object.keys(selfHostedTools).sort()).toEqual([
      'deletePostTool',
      'generateImageTool',
      'generateVideoOptions',
      'generateVideoTool',
      'groupList',
      'integrationList',
      'integrationSchedulePostTool',
      'integrationSchema',
      'mediaListTool',
      'postSettingsTool',
      'postsListTool',
      'triggerTool',
      'uploadFromUrlTool',
      'videoFunctionTool',
      'videoStatusTool',
    ]);
  });

  it.each(Object.keys(selfHostedTools))(
    '%s keeps its self-hosted contract',
    async (name) => {
      const { tools: listed } = await selfHostedServer.getToolListInfo();
      const { description, inputSchema, outputSchema, _meta } = listed.find(
        (tool) => tool.name === name
      )!;

      expect({
        name,
        description,
        inputSchema,
        outputSchema,
        _meta,
        annotations: selfHostedTools[name].mcp?.annotations,
      }).toMatchSnapshot();
    }
  );
});

// What startMcp builds for the ChatGPT connection: ChatgptToolsService over the
// full set, with the lookups of the providers Add Channel offers. Both lists
// are read when the tools are built, so they are fixed here and put back.
const chatgptEnv = {
  SHAREK_LISTED_PROVIDERS: 'pinterest,instagram',
  HIDDEN_PROVIDERS: 'instagram',
};
const chatgptTools: Record<string, any> = (() => {
  const before = Object.fromEntries(
    Object.keys(chatgptEnv).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, chatgptEnv);
  try {
    return new ChatgptToolsService(new IntegrationManager(), {} as any).tools(
      tools
    );
  } finally {
    Object.entries(before).forEach(([key, value]) =>
      value === undefined ? delete process.env[key] : (process.env[key] = value)
    );
  }
})();
const chatgptServer = new MCPServer({
  name: 'Sharek',
  version: '1.0.0',
  tools: chatgptTools,
});

describe('the ChatGPT connection', () => {
  it('exposes exactly the pinned tools', () => {
    expect(Object.keys(chatgptTools).sort()).toEqual([
      'delete_post',
      'generate_image',
      'get_media_status',
      'get_posting_rules',
      'get_upload_status',
      'get_upload_ticket',
      'list_brands',
      'list_channels',
      'list_media',
      'list_pinterest_boards',
      'list_posts',
      'schedule_post',
      'update_post_settings',
      'upload_media_from_device',
      'upload_media_from_url',
    ]);
  });

  it('has none of the tools that are not on this connection', () => {
    const notHere = [
      'triggerTool',
      'videoFunctionTool',
      'generateVideoOptions',
      'generateVideoTool',
      'videoStatusTool',
      'integrationSchema',
      'clippingTool',
      'clippingStatusTool',
      'clippingWidgetTicketTool',
    ];
    expect(
      Object.keys(chatgptTools).filter((n) => notHere.includes(n))
    ).toEqual([]);
  });

  it.each(Object.keys(chatgptTools))(
    '%s keeps its ChatGPT contract',
    async (name) => {
      const { tools: listed } = await chatgptServer.getToolListInfo();
      const { description, inputSchema, outputSchema, _meta } = listed.find(
        (tool) => tool.name === name
      )!;

      expect({
        name,
        description,
        inputSchema,
        outputSchema,
        _meta,
        annotations: chatgptTools[name].mcp?.annotations,
      }).toMatchSnapshot();
    }
  );
});
