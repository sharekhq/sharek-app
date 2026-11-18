import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  IntegrationManager,
  socialIntegrationList,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { filterListedProviders } from '@gitroom/nestjs-libraries/integrations/listed.providers';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CHATGPT_TOOLSET } from '@gitroom/nestjs-libraries/chat/chatgpt/chatgpt.toolset';

// A path is keys joined by dots, `[]` after a key steps into its array's items
// (`socialPost[].postsAndComments[].content`).
const describeAt = (node: any, segments: string[], text: string): any => {
  if (!segments.length) {
    return node.describe(text);
  }

  const typeName = node._def.typeName;
  if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
    const inner = describeAt(node._def.innerType, segments, text);
    return inner && new node.constructor({ ...node._def, innerType: inner });
  }
  if (typeName === 'ZodUnion') {
    const options = node._def.options.map((option: any) =>
      describeAt(option, segments, text)
    );
    return options.some(Boolean)
      ? new node.constructor({
          ...node._def,
          options: options.map((option: any, i: number) =>
            option ? option : node._def.options[i]
          ),
        })
      : undefined;
  }

  const [head, ...rest] = segments;
  if (head === '[]') {
    const element =
      typeName === 'ZodArray' && describeAt(node._def.type, rest, text);
    return element && new node.constructor({ ...node._def, type: element });
  }
  if (typeName !== 'ZodObject' || !(head in node.shape)) {
    return undefined;
  }
  const child = describeAt(node.shape[head], rest, text);
  return (
    child &&
    new node.constructor({
      ...node._def,
      shape: () => ({ ...node.shape, [head]: child }),
    })
  );
};

// Rebuilds the schema with the description of each node named by a path
// replaced; a path that matches no node throws, so a source schema change
// fails loudly.
export const withDescriptions = (
  schema: any,
  byPath: Record<string, string> = {}
) =>
  Object.entries(byPath).reduce((current, [path, text]) => {
    const described = describeAt(
      current,
      path.split(/(\[\])?\./).flatMap((part) => (part ? [part] : [])),
      text
    );
    if (!described) {
      throw new Error(`No field matches the path ${path}`);
    }
    return described;
  }, schema);

const isPlainObject = (value: any) =>
  value && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Rewrites the string values of a result: arrays and plain objects are walked,
// keys and every other object (dates, class instances) stay as they are.
const rewriteStrings = (value: any, rewrite: (text: string) => string): any =>
  typeof value === 'string'
    ? rewrite(value)
    : Array.isArray(value)
    ? value.map((item) => rewriteStrings(item, rewrite))
    : isPlainObject(value)
    ? Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          rewriteStrings(item, rewrite),
        ])
      )
    : value;

// Runs a tool and renames the names in its result, or in the message of the
// error it throws.
const rewriting = async (rewrite: (text: string) => string, run: () => any) => {
  try {
    return rewriteStrings(await run(), rewrite);
  } catch (error) {
    if (error instanceof Error) {
      error.message = rewrite(error.message);
    }
    throw error;
  }
};

// Every key of the map, as a whole word, to its value, then the rewrites.
const renamer = (
  map: Record<string, string>,
  rewrites: { pattern: RegExp; replacement: string }[] = []
) => {
  const pattern = new RegExp(`\\b(${Object.keys(map).join('|')})\\b`, 'g');

  return (text: string) =>
    rewrites.reduce(
      (current, { pattern, replacement }) =>
        current.replace(pattern, replacement),
      Object.keys(map).length
        ? text.replace(pattern, (name) => map[name])
        : text
    );
};

const postingRulesOutput = z.object({
  output: z.object({
    rules: z.string().describe('What the platform requires of a post'),
    maxLength: z.number().describe('The maximum length of a post or comment'),
    settings: z
      .any()
      .describe('The settings a post to this platform can or must include'),
    lookups: z
      .array(
        z.object({
          name: z.string().describe('The name of the lookup tool'),
          description: z.string().describe('What the lookup tool finds'),
          inputs: z
            .array(
              z.object({
                key: z.string().describe('The name of the field to pass'),
                description: z.string().describe('What the field holds'),
                required: z.boolean().describe('Whether the field is needed'),
              })
            )
            .describe(
              'The fields the lookup tool takes besides the channel id'
            ),
        })
      )
      .describe(
        'The lookup tools that find the ids, tags and other values some settings need'
      ),
  }),
});

// A lookup a provider declares, with the providers that offer it.
interface OfferedLookup {
  name: string;
  title: string;
  description: string;
  optionalFields?: string[];
  methodName: string;
  dataSchema: { key: string; type: string; description: string }[];
  providers: string[];
}

// The tools of the ChatGPT connection: the source tools' behaviour under their
// own names, descriptions and hints.
@Injectable()
export class ChatgptToolsService {
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService
  ) {}

  // The providers Add Channel offers.
  private _offeredProviders() {
    return filterListedProviders(socialIntegrationList)
      .map((p) => p.identifier)
      .filter(
        (identifier) => !this._integrationManager.isHiddenProvider(identifier)
      );
  }

  // One lookup per name among the offered providers. An inherited lookup is
  // one declaration, so linkedin and linkedin-page share a tool; two different
  // declarations with one name can't both be served.
  private _offeredLookups(providers: string[]) {
    const all = this._integrationManager.getAllLookups();
    const offered = new Map<string, OfferedLookup>();
    const declarations = new Map<string, any>();

    for (const identifier of providers) {
      for (const lookup of all[identifier]) {
        if (
          declarations.has(lookup.name) &&
          declarations.get(lookup.name) !== lookup
        ) {
          throw new Error(
            `Two different lookups are named ${lookup.name}, declared by ${
              offered.get(lookup.name)!.providers[0]
            } and ${identifier}`
          );
        }
        declarations.set(lookup.name, lookup);
        offered.set(lookup.name, {
          ...lookup,
          providers: [
            ...(offered.get(lookup.name)?.providers ?? []),
            identifier,
          ],
        });
      }
    }

    return [...offered.values()];
  }

  tools(source: Record<string, any>) {
    // Every source name, record key and id alike, to its ChatGPT name.
    const names = Object.fromEntries(
      Object.entries(CHATGPT_TOOLSET).flatMap(([key, row]) =>
        [key, source[key]?.id].filter(Boolean).map((from) => [from, row.name])
      )
    );
    const providers = this._offeredProviders();
    const lookups = source.triggerTool ? this._offeredLookups(providers) : [];

    const core = Object.entries(CHATGPT_TOOLSET)
      .filter(([key]) => source[key])
      .map(([key, row]) => {
        const src = source[key];
        const rewrite = renamer(names, row.resultRewrites);
        const rules = key === 'integrationSchema';

        return [
          row.name,
          createTool({
            id: row.name,
            description: row.description,
            inputSchema: withDescriptions(src.inputSchema, {
              ...row.input,
              ...(rules && {
                platform: `The platform identifier of the channel, one of ${providers.join(
                  ', '
                )}`,
              }),
            }),
            outputSchema: rules
              ? postingRulesOutput
              : withDescriptions(src.outputSchema, row.output),
            mcp: {
              annotations: { title: row.title, ...row.annotations },
              _meta: { ...src.mcp?._meta, ...row.meta },
            },
            execute: async (input: any, context: any) =>
              rewriting(rewrite, async () => {
                const result = await src.execute(input, context);

                return rules
                  ? this._postingRules(result.output, input.platform, lookups)
                  : result;
              }),
          } as any),
        ];
      });

    return Object.fromEntries([
      ...core,
      ...lookups.map((lookup) => [
        lookup.name,
        this._lookupTool(source.triggerTool, lookup, renamer(names)),
      ]),
    ]);
  }

  // The rules and settings of a platform with its own lookup method names
  // replaced by the lookup tool names, and the lookups it can use in place of
  // the source's tools.
  private _postingRules(
    output: { rules: string; maxLength: number; settings: any },
    platform: string,
    offered: OfferedLookup[]
  ) {
    const own = offered.filter((lookup) => lookup.providers.includes(platform));
    const rewrite = renamer(
      Object.fromEntries(own.map((lookup) => [lookup.methodName, lookup.name]))
    );

    return {
      output: {
        rules: rewriteStrings(output.rules, rewrite),
        maxLength: output.maxLength,
        settings: rewriteStrings(output.settings, rewrite),
        lookups: own.map((lookup) => ({
          name: lookup.name,
          description: lookup.description,
          inputs: lookup.dataSchema.map(({ key, description }) => ({
            key,
            description,
            required: !lookup.optionalFields?.includes(key),
          })),
        })),
      },
    };
  }

  // A lookup as a tool: the channel's provider is checked first, since method
  // names repeat across providers, then the trigger tool runs the call with its
  // organization check, token refresh and reconnect handling.
  private _lookupTool(
    trigger: any,
    lookup: OfferedLookup,
    rewrite: (text: string) => string
  ) {
    return createTool({
      id: lookup.name,
      description: lookup.description,
      inputSchema: z.object({
        integrationId: z.string().describe('The channel id from list_channels'),
        ...Object.fromEntries(
          lookup.dataSchema.map(({ key, description }) => {
            const field = z.string().describe(description);
            return [
              key,
              lookup.optionalFields?.includes(key) ? field.optional() : field,
            ];
          })
        ),
      }),
      outputSchema: trigger.outputSchema,
      mcp: {
        annotations: {
          title: lookup.title,
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      execute: async (input: any, context: any) =>
        rewriting(rewrite, async () => {
          checkAuth(input, context);
          const organizationId = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          ).id;

          const channel = await this._integrationService.getIntegrationById(
            organizationId,
            input.integrationId
          );
          if (!channel) {
            throw new Error(
              'Channel not found, use list_channels to get a valid channel id'
            );
          }
          if (!lookup.providers.includes(channel.providerIdentifier)) {
            throw new Error(
              `This lookup is for ${lookup.providers.join(
                ', '
              )} channels, not ${channel.providerIdentifier}`
            );
          }

          return trigger.execute(
            {
              integrationId: input.integrationId,
              methodName: lookup.methodName,
              dataSchema: lookup.dataSchema
                .filter(({ key }) => input[key] !== undefined)
                .map(({ key }) => ({ key, value: input[key] })),
            },
            context
          );
        }),
    } as any);
  }
}
