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
import { uploadWidgetHtml } from '@gitroom/nestjs-libraries/chat/ui/upload.widget';
import {
  IntegrationManager,
  socialIntegrationList,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
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
const manager = new IntegrationManager();
const stub = {
  getAllTools: () => manager.getAllTools(),
  getAllRulesDescription: () => manager.getAllRulesDescription(),
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

// The integration manager and service are used by the lookups.
const getIntegrationById = jest.fn();
const service = new ChatgptToolsService(manager, {
  getIntegrationById,
} as any);
const chatgpt: Record<string, any> = service.tools(source);

// getToolListInfo leaves the annotations out; the tools/list handler adds
// them from the tool's own `mcp`, so they are read from there.
const listed = async (tools: Record<string, any>) =>
  (
    await new MCPServer({
      name: CHATGPT_SERVER_NAME,
      version: '1.0.0',
      tools,
    }).getToolListInfo()
  ).tools.map((tool) => ({
    ...tool,
    annotations: tools[tool.id].mcp?.annotations,
  }));

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
    const lookups = Object.values(manager.getAllLookups()).flatMap((list) =>
      list.map((lookup) => lookup.name)
    );

    expect(
      Object.keys(chatgpt)
        .filter((name) => !lookups.includes(name))
        .sort()
    ).toEqual(Object.values(bySourceName).sort());
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
      // get_posting_rules has its own output schema by design (lookups
      // replace tools), pinned in its own cases.
      if (name !== 'get_posting_rules') {
        expect(stripDescriptions(to.outputSchema)).toEqual(
          stripDescriptions(from.outputSchema)
        );
      }
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
  // The output schema is checked on the way out, so each test returns a
  // result its tool's schema accepts.
  const posts = (post: object) => ({
    output: {
      posts: [
        {
          id: '1',
          publishDate: '',
          state: 'QUEUE',
          error: null,
          content: '',
          group: '',
          integrationId: '',
          platform: 'x',
          integrationName: '',
          settings: {},
          ...post,
        },
      ],
    },
  });

  it('renames every source name, record key and id alike, as whole words, in an error', async () => {
    const run = service.tools(
      sourceRunning('integrationSchedulePostTool', async () => ({
        output: {
          errors:
            'try integrationSchedulePostTool, schedulePostTool or uploadFromUrlTool, then integrationList; xintegrationListx stays',
        },
      }))
    ).schedule_post;

    const result = await run.execute({ socialPost: [] }, context());

    expect(result.output.errors).toBe(
      'try schedule_post, schedule_post or upload_media_from_url, then list_channels; xintegrationListx stays'
    );
  });

  it('renames the error strings of a result, not keys, dates or class instances', async () => {
    class Box {
      note = 'integrationList';
    }
    const date = new Date(0);
    const box = new Box();
    // The free-form field of list_posts (settings) carries the values under test.
    const run = service.tools(
      sourceRunning('postsListTool', async () =>
        posts({
          error: 'integrationList',
          settings: {
            errors: ['integrationList', { deep: 'integrationList' }],
            integrationList: 'integrationList',
            date,
            box,
            count: 3,
          },
        })
      )
    ).list_posts;

    const result = (
      await run.execute({ startDate: '', endDate: '' }, context())
    ).output.posts[0];

    expect(result.error).toBe('list_channels');
    expect(result.settings.errors).toEqual([
      'list_channels',
      { deep: 'list_channels' },
    ]);
    expect(result.settings.integrationList).toBe('integrationList');
    expect(result.settings.date).toBe(date);
    expect(result.settings.box).toBe(box);
    expect(result.settings.box.note).toBe('integrationList');
    expect(result.settings.count).toBe(3);
  });

  it('leaves the post content of the user as it is', async () => {
    const run = service.tools(
      sourceRunning('postsListTool', async () =>
        posts({ content: 'about groupList today' })
      )
    ).list_posts;

    const result = await run.execute({ startDate: '', endDate: '' }, context());

    expect(result.output.posts[0].content).toBe('about groupList today');
  });

  it('leaves the channel name of the user as it is', async () => {
    const run = service.tools(
      sourceRunning('integrationList', async () => ({
        output: [
          { id: '1', picture: '', platform: 'x', name: 'integrationList' },
        ],
      }))
    ).list_channels;

    expect((await run.execute({}, context())).output[0].name).toBe(
      'integrationList'
    );
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

// Both lists are read when the tools are built, so each case sets them and
// puts them back.
const build = (env: Record<string, string | undefined> = {}) => {
  const values = {
    SHAREK_LISTED_PROVIDERS: undefined,
    HIDDEN_PROVIDERS: undefined,
    ...env,
  } as Record<string, string | undefined>;
  const before = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );
  const apply = (next: Record<string, string | undefined>) =>
    Object.entries(next).forEach(([key, value]) =>
      value === undefined ? delete process.env[key] : (process.env[key] = value)
    );
  apply(values);
  try {
    return service.tools(sourceWithTrigger);
  } finally {
    apply(before);
  }
};

const triggerExecute = jest.fn();
const sourceWithTrigger = {
  ...source,
  triggerTool: Object.assign(Object.create(source.triggerTool), {
    execute: triggerExecute,
  }),
};

const coreNames = Object.values(bySourceName);
const lookupNames = (env: Record<string, string | undefined> = {}) =>
  Object.keys(build(env)).filter((name) => !coreNames.includes(name));

describe('the lookup tools', () => {
  beforeEach(() => {
    triggerExecute.mockReset();
    getIntegrationById.mockReset();
  });

  it('offers one tool per lookup name, linkedin and linkedin-page sharing one', () => {
    const lookups = manager.getAllLookups();
    const declared = Object.values(lookups).flatMap((list) =>
      list.map((lookup) => lookup.name)
    );

    expect(lookupNames().sort()).toEqual([...new Set(declared)].sort());
    expect(lookups['linkedin-page'].length).toBeGreaterThan(0);
    expect(
      lookupNames({ SHAREK_LISTED_PROVIDERS: 'linkedin,linkedin-page' })
    ).toEqual(lookups['linkedin'].map((lookup) => lookup.name));
  });

  it('offers nothing of an unlisted or a hidden provider', () => {
    const pinterest = manager.getAllLookups()['pinterest'].map((l) => l.name);

    expect(lookupNames({ SHAREK_LISTED_PROVIDERS: 'x' })).toEqual([]);
    expect(lookupNames({ SHAREK_LISTED_PROVIDERS: 'pinterest' })).toEqual(
      pinterest
    );
    expect(
      lookupNames({
        SHAREK_LISTED_PROVIDERS: 'pinterest',
        HIDDEN_PROVIDERS: 'pinterest',
      })
    ).toEqual([]);
  });

  it('throws when two different declarations share a name', () => {
    class ClashA {
      identifier = 'clash-a';
      @Tool({
        description: 'a',
        dataSchema: [],
        lookup: { name: 'clash_lookup', title: 'A', description: 'A' },
      })
      one() {}
    }
    class ClashB {
      identifier = 'clash-b';
      @Tool({
        description: 'b',
        dataSchema: [],
        lookup: { name: 'clash_lookup', title: 'B', description: 'B' },
      })
      two() {}
    }
    const fixtures = [new ClashA(), new ClashB()] as any[];
    socialIntegrationList.push(...fixtures);
    try {
      expect(() => build()).toThrow(/clash_lookup/);
    } finally {
      socialIntegrationList.splice(-fixtures.length);
    }
  });

  it('takes the channel id and the declared fields, optional ones as declared', async () => {
    const tool = (await listed(build())).find(
      (t) => t.name === 'search_instagram_audio'
    )!;
    const schema: any = tool.inputSchema;

    expect(Object.keys(schema.properties).sort()).toEqual([
      'integrationId',
      'q',
      'type',
    ]);
    expect(schema.properties.integrationId.description).toBe(
      'The channel id from list_channels'
    );
    expect(schema.required).toEqual(['integrationId']);
    expect(tool.annotations).toEqual({
      title: 'Search Instagram Audio',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it('answers with the output schema of the trigger tool', async () => {
    const from = (await listed(source)).find((t) => t.name === 'triggerTool')!;
    const tool = (await listed(build())).find(
      (t) => t.name === 'list_pinterest_boards'
    )!;

    expect(tool.outputSchema).toEqual(from.outputSchema);
  });

  it('throws for an unknown channel without calling the trigger tool', async () => {
    getIntegrationById.mockResolvedValue(null);

    await expect(
      build().list_pinterest_boards.execute(
        { integrationId: 'nope' },
        context()
      )
    ).rejects.toThrow(
      'Channel not found, use list_channels to get a valid channel id'
    );
    expect(getIntegrationById).toHaveBeenCalledWith('org-1', 'nope');
    expect(triggerExecute).not.toHaveBeenCalled();
  });

  it('throws naming the providers of a lookup for a channel of another provider', async () => {
    getIntegrationById.mockResolvedValue({ providerIdentifier: 'x' });

    await expect(
      build().search_tiktok_music.execute({ integrationId: 'c1' }, context())
    ).rejects.toThrow(/tiktok-business/);
    expect(triggerExecute).not.toHaveBeenCalled();
  });

  it('hands a channel of the right provider to the trigger tool, renaming the result', async () => {
    getIntegrationById.mockResolvedValue({ providerIdentifier: 'instagram' });
    triggerExecute.mockResolvedValue({
      output: { error: 'try integrationList' },
    });
    const ctx = context();

    const result = await build().search_instagram_audio.execute(
      { integrationId: 'c1', q: 'jazz' },
      ctx
    );

    expect(triggerExecute).toHaveBeenCalledWith(
      {
        integrationId: 'c1',
        methodName: 'audioSearch',
        dataSchema: [{ key: 'q', value: 'jazz' }],
      },
      ctx
    );
    expect(result).toEqual({ output: { error: 'try list_channels' } });
  });

  it('passes the failure message of the trigger tool on, with names renamed', async () => {
    getIntegrationById.mockResolvedValue({ providerIdentifier: 'instagram' });
    triggerExecute.mockRejectedValue(
      new Error('The channel was disconnected, use integrationList')
    );

    await expect(
      build().search_instagram_audio.execute({ integrationId: 'c1' }, context())
    ).rejects.toThrow('The channel was disconnected, use list_channels');
  });
});

describe('get_posting_rules', () => {
  const rules = async (
    platform: string,
    env: Record<string, string | undefined> = {}
  ) =>
    (
      await build(env).get_posting_rules.execute(
        { isPremium: false, platform },
        context()
      )
    ).output;

  it('returns rules, length, settings and lookups, with no tools key', async () => {
    const output = await rules('pinterest');

    expect(Object.keys(output).sort()).toEqual([
      'lookups',
      'maxLength',
      'rules',
      'settings',
    ]);
    expect(output.lookups.map((l: any) => l.name)).toContain(
      'list_pinterest_boards'
    );
    for (const lookup of output.lookups) {
      expect(Object.keys(lookup).sort()).toEqual([
        'description',
        'inputs',
        'name',
      ]);
      for (const input of lookup.inputs) {
        expect(Object.keys(input).sort()).toEqual([
          'description',
          'key',
          'required',
        ]);
      }
    }
  });

  it('marks optional lookup fields as not required', async () => {
    const audio = (await rules('instagram')).lookups.find(
      (l: any) => l.name === 'search_instagram_audio'
    );

    expect(audio.inputs.map((i: any) => [i.key, i.required])).toEqual([
      ['q', false],
      ['type', false],
    ]);
  });

  it('names the lookup tools where TikTok rules and settings name the methods', async () => {
    const output = await rules('tiktok-business');
    const text = JSON.stringify([output.rules, output.settings]);

    expect(text).toContain('search_tiktok_music');
    expect(text).toContain('search_tiktok_locations');
    expect(text).not.toMatch(/musicSearch|locationSearch/);
  });

  // Method names that are plain words (boards, tags, list, label) are also
  // what the settings text says in prose, so only camelCase ones are mapped.
  it('keeps the plain words of rules and settings that equal a lookup method name', async () => {
    const pinterest = JSON.stringify((await rules('pinterest')).settings);
    const wordpress = JSON.stringify((await rules('wordpress')).settings);

    expect(pinterest).toContain('the boards list of the channel');
    expect(pinterest).not.toContain('list_pinterest_boards');
    expect(wordpress).toMatch(/\btags\b/);
    expect(wordpress).not.toContain('list_wordpress_tags');
  });

  it('lists no lookup for an unlisted provider', async () => {
    expect(
      (await rules('pinterest', { SHAREK_LISTED_PROVIDERS: 'x' })).lookups
    ).toEqual([]);
  });

  it('lists only the listed identifiers in the platform description', async () => {
    const tool = (
      await listed(build({ SHAREK_LISTED_PROVIDERS: 'pinterest,instagram' }))
    ).find((t) => t.name === 'get_posting_rules')!;
    const description = (tool.inputSchema as any).properties.platform
      .description;

    expect(description).toContain('pinterest');
    expect(description).toContain('instagram');
    expect(description).not.toContain('linkedin');
  });

  // The text a result carries: its string values, not its keys.
  const stringsIn = (value: any): string[] =>
    typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
      ? Object.values(value).flatMap(stringsIn)
      : [];

  it('returns no old tool name, own lookup method name or CLI or API pointer for any provider', async () => {
    const lookups = manager.getAllLookups();
    const sourceNames = Object.keys(source).concat(
      Object.values(source).map((tool: any) => tool.id)
    );

    for (const { identifier } of socialIntegrationList) {
      const output = await rules(identifier);
      const own = lookups[identifier]
        .map((lookup) => lookup.methodName)
        .filter((methodName) => /[A-Z]/.test(methodName));
      const old = new RegExp(`\\b(${[...sourceNames, ...own].join('|')})\\b`);

      for (const text of stringsIn([output.rules, output.settings])) {
        expect(text).not.toMatch(old);
        expect(text).not.toMatch(/\bCLI\b|public API|docs\./i);
      }
    }
  });
});

describe('the ChatGPT resources', () => {
  const backendUrl = 'https://api.sharek.test/api';
  const upload = {
    name: 'Upload Media',
    description:
      'Upload an image or video from the device to the media library',
    html: '<p>the upload widget</p>',
    meta: {
      csp: { connectDomains: ['https://api.sharek.test'] },
      permissions: { clipboardWrite: {} },
      prefersBorder: true,
    },
  };

  it('serves only the upload widget, under a sharek uri', () => {
    const resources = service.resources(upload, backendUrl, true);

    expect(Object.keys(resources)).toEqual([CHATGPT_UPLOAD_WIDGET_URI]);
    expect(CHATGPT_UPLOAD_WIDGET_URI).toBe('ui://sharek/upload');
    expect(JSON.stringify(resources)).not.toMatch(/postiz/i);
  });

  it.each([true, false])(
    'builds its html with the ChatGPT ticket tool name (adjustable %s)',
    (adjustable) => {
      expect(
        service.resources(upload, backendUrl, adjustable)[
          CHATGPT_UPLOAD_WIDGET_URI
        ].html
      ).toBe(
        uploadWidgetHtml(backendUrl, adjustable, {
          ticketTool: 'get_upload_ticket',
          app: 'sharek-upload',
        })
      );
    }
  );

  it('keeps the name, description and meta of the upload resource it is given', () => {
    const { html, ...rest } = service.resources(upload, backendUrl, true)[
      CHATGPT_UPLOAD_WIDGET_URI
    ];
    const { html: baseHtml, ...base } = upload;

    expect(rest).toEqual(base);
  });
});
