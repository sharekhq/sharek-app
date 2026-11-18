// The real factory reaches for the R2 SDK and its env; pinned off so no
// machine's storage or RunPod settings change what is built.
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
// transform cannot load.
jest.mock('nostr-tools', () => ({
  getPublicKey: () => '',
  finalizeEvent: () => ({}),
  Relay: class {},
  SimplePool: class {},
}));

import { MCPServer } from '@mastra/mcp';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import {
  ChatgptToolsService,
  withDescriptions,
} from '@gitroom/nestjs-libraries/chat/chatgpt/chatgpt.tools.service';
import {
  CHATGPT_SERVER_NAME,
  CHATGPT_UPLOAD_WIDGET_URI,
} from '@gitroom/nestjs-libraries/chat/chatgpt/chatgpt.toolset';

// Every constructor argument gets the same stub. The media service's upload
// rejects, so the real uploadFromUrlTool reaches its failed-upload branch.
const stub = {
  getAllVideos: () => [{ title: 'Fake Provider' }],
  uploadFromUrl: async () => {
    throw new Error('connect ECONNREFUSED');
  },
};

// Keyed by name, as LoadToolsService.loadTools keys them; every tool exists.
const source: Record<string, any> = Object.fromEntries(
  toolList.map((Tool) => {
    const instance: AgentToolInterface = new (Tool as any)(stub, stub, stub);
    return [instance.name, instance.run()];
  })
);

// The integration manager and service are only used by the lookups.
const service = new ChatgptToolsService(stub as any, stub as any);
const chatgpt: Record<string, any> = service.tools(source);

const listed = async (tools: Record<string, any>) =>
  (
    await new MCPServer({
      name: CHATGPT_SERVER_NAME,
      version: '1.0.0',
      tools,
    }).getToolListInfo()
  ).tools;

// A source whose tool runs the given function instead, the rest untouched.
const sourceRunning = (name: string, execute: (...args: any[]) => any) => ({
  ...source,
  [name]: Object.assign(Object.create(source[name]), { execute }),
});

const context = () => {
  const values = new Map<string, string>();
  return {
    requestContext: {
      get: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
    },
    mcp: { extra: { authInfo: { id: 'org-1' } } },
  };
};

const bySourceName: Record<string, string> = {
  integrationList: 'list_channels',
  groupList: 'list_brands',
  integrationSchema: 'get_posting_rules',
  integrationSchedulePostTool: 'schedule_post',
  postsListTool: 'list_posts',
  postSettingsTool: 'update_post_settings',
  deletePostTool: 'delete_post',
  generateImageTool: 'generate_image',
  uploadFromUrlTool: 'upload_media_from_url',
  mediaListTool: 'list_media',
  mediaStatusTool: 'get_media_status',
  uploadWidgetTool: 'upload_media_from_device',
  uploadWidgetStatusTool: 'get_upload_status',
  uploadWidgetTicketTool: 'get_upload_ticket',
};

const notOnChatgpt = [
  'triggerTool',
  'videoFunctionTool',
  'generateVideoOptions',
  'generateVideoTool',
  'videoStatusTool',
  'clippingTool',
  'clippingStatusTool',
  'clippingWidgetTicketTool',
];

const stripDescriptions = (value: any): any =>
  Array.isArray(value)
    ? value.map(stripDescriptions)
    : value && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== 'description')
          .map(([key, v]) => [key, stripDescriptions(v)])
      )
    : value;

const descriptionsIn = (value: any): string[] =>
  Array.isArray(value)
    ? value.flatMap(descriptionsIn)
    : value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, v]) =>
        key === 'description' && typeof v === 'string' ? [v] : descriptionsIn(v)
      )
    : [];

describe('withDescriptions', () => {
  const schema = source.integrationSchedulePostTool.inputSchema;
  const path = 'socialPost[].postsAndComments[].content';
  const content = (s: any) =>
    s.shape.socialPost.element.shape.postsAndComments.element.shape.content;

  it('replaces a nested description by path on real createTool output', () => {
    const described = withDescriptions(schema, { [path]: 'New text' });

    expect(content(described).description).toBe('New text');
    expect(content(schema).description).not.toBe('New text');
  });

  it('throws on a path that matches no node', () => {
    expect(() =>
      withDescriptions(schema, { 'socialPost[].nothingHere': 'x' })
    ).toThrow();
  });
});

describe('the ChatGPT toolset', () => {
  it('exposes exactly the core tools', () => {
    expect(Object.keys(chatgpt).sort()).toEqual(
      Object.values(bySourceName).sort()
    );
  });

  it('leaves get_media_status out when the source has no media status tool', () => {
    const { mediaStatusTool, ...without } = source;

    expect(Object.keys(service.tools(without))).not.toContain(
      'get_media_status'
    );
  });

  it('has no trigger, video, clipping or schema tool', async () => {
    const text = JSON.stringify(await listed(chatgpt));

    for (const name of notOnChatgpt.concat('integrationSchema')) {
      expect(Object.keys(chatgpt)).not.toContain(name);
      expect(text).not.toContain(name);
    }
  });

  it('keeps each source input and output schema, minus descriptions', async () => {
    const sourceListed = await listed(source);
    const chatgptListed = await listed(chatgpt);

    for (const [sourceName, name] of Object.entries(bySourceName)) {
      const from = sourceListed.find((t) => t.name === sourceName)!;
      const to = chatgptListed.find((t) => t.name === name)!;

      expect(stripDescriptions(to.inputSchema)).toEqual(
        stripDescriptions(from.inputSchema)
      );
      expect(stripDescriptions(to.outputSchema)).toEqual(
        stripDescriptions(from.outputSchema)
      );
    }
  });

  it('gives every tool a title and explicit read, destructive and open-world hints', async () => {
    for (const tool of await listed(chatgpt)) {
      expect(typeof tool.annotations?.title).toBe('string');
      expect(tool.annotations?.title).not.toBe('');
      expect(typeof tool.annotations?.readOnlyHint).toBe('boolean');
      expect(typeof tool.annotations?.destructiveHint).toBe('boolean');
      expect(typeof tool.annotations?.openWorldHint).toBe('boolean');
    }
  });

  it('keeps the source idempotentHint', async () => {
    const sourceListed = await listed(source);
    const chatgptListed = await listed(chatgpt);

    for (const [sourceName, name] of Object.entries(bySourceName)) {
      expect(
        chatgptListed.find((t) => t.name === name)!.annotations?.idempotentHint
      ).toBe(
        sourceListed.find((t) => t.name === sourceName)!.annotations
          ?.idempotentHint
      );
    }
  });

  it('keeps get_upload_ticket for the widget only', async () => {
    const tool = (await listed(chatgpt)).find(
      (t) => t.name === 'get_upload_ticket'
    )!;

    expect((tool as any)._meta.ui.visibility).toEqual(['app']);
  });

  it('points upload_media_from_device at the upload widget', async () => {
    const tool = (await listed(chatgpt)).find(
      (t) => t.name === 'upload_media_from_device'
    )!;

    expect(CHATGPT_UPLOAD_WIDGET_URI).toBe('ui://sharek/upload');
    expect((tool as any)._meta.ui.resourceUri).toBe(CHATGPT_UPLOAD_WIDGET_URI);
  });
});

describe('the ChatGPT names in returned text', () => {
  it('renames every source name, record key and id alike, as whole words', async () => {
    const run = service.tools(
      sourceRunning('integrationList', async () => ({
        text: 'try integrationSchedulePostTool, schedulePostTool or uploadFromUrlTool, then integrationList; xintegrationListx stays',
      }))
    ).list_channels;

    expect(await run.execute({}, context())).toEqual({
      text: 'try schedule_post, schedule_post or upload_media_from_url, then list_channels; xintegrationListx stays',
    });
  });

  it('rewrites only string values, not keys, dates or class instances', async () => {
    class Box {
      note = 'integrationList';
    }
    const date = new Date(0);
    const box = new Box();
    const run = service.tools(
      sourceRunning('integrationList', async () => ({
        integrationList: ['integrationList', { deep: 'integrationList' }],
        date,
        box,
        count: 3,
      }))
    ).list_channels;

    const result = await run.execute({}, context());

    expect(result.integrationList).toEqual([
      'list_channels',
      { deep: 'list_channels' },
    ]);
    expect(result.date).toBe(date);
    expect(result.box).toBe(box);
    expect(result.box.note).toBe('integrationList');
    expect(result.count).toBe(3);
  });

  it('rethrows the same Error with a rewritten message', async () => {
    const error = new Error('try integrationSchedulePostTool again');
    const run = service.tools(
      sourceRunning('integrationList', async () => {
        throw error;
      })
    ).list_channels;

    await expect(run.execute({}, context())).rejects.toBe(error);
    expect(error.message).toBe('try schedule_post again');
  });

  it('points a failed upload to upload_media_from_device, not the CLI or the public API', async () => {
    const result = await chatgpt.upload_media_from_url.execute(
      { url: 'https://example.com/a.png' },
      context()
    );

    expect(result.error).toContain('upload_media_from_device');
    expect(result.error).not.toMatch(/CLI/);
    expect(result.error).not.toMatch(/public API/i);
    expect(result.error).not.toContain('docs.sharek.app');
  });
});

describe('the ChatGPT wording', () => {
  const banned: [string, RegExp][] = [
    ['Postiz', /postiz/i],
    ['MCP', /\bMCP\b/],
    ['integration', /integration/i],
    ['a Tool suffix', /[a-z]Tool\b/],
    ['CLI', /\bCLI\b/],
    ['public API', /public API/i],
    ['docs', /docs\./i],
    ['steering word', /\b(instead|prefer|better|never|always)\b/i],
    ...Object.keys(bySourceName)
      .concat(notOnChatgpt)
      .map((name): [string, RegExp] => [name, new RegExp(`\\b${name}\\b`)]),
  ];

  it('has none of the banned wording in a name, title, description or field description', async () => {
    for (const tool of await listed(chatgpt)) {
      const texts = [
        tool.name,
        tool.annotations?.title ?? '',
        tool.description ?? '',
        ...descriptionsIn(tool.inputSchema),
        ...descriptionsIn(tool.outputSchema),
      ];

      for (const [label, pattern] of banned) {
        for (const text of texts) {
          if (pattern.test(text)) {
            throw new Error(`${tool.name} has ${label}: ${text}`);
          }
        }
      }
    }
  });
});
