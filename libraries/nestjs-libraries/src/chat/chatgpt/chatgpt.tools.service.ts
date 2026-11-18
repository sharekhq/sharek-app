import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
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

// The tools of the ChatGPT connection: the source tools' behaviour under their
// own names, descriptions and hints.
@Injectable()
export class ChatgptToolsService {
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService
  ) {}

  tools(source: Record<string, any>) {
    // Every source name, record key and id alike, to its ChatGPT name.
    const names = Object.fromEntries(
      Object.entries(CHATGPT_TOOLSET).flatMap(([key, row]) =>
        [key, source[key]?.id].filter(Boolean).map((from) => [from, row.name])
      )
    );
    const pattern = new RegExp(`\\b(${Object.keys(names).join('|')})\\b`, 'g');

    return Object.fromEntries(
      Object.entries(CHATGPT_TOOLSET)
        .filter(([key]) => source[key])
        .map(([key, row]) => {
          const src = source[key];
          const rewrite = (text: string) =>
            (row.resultRewrites ?? []).reduce(
              (current, { pattern, replacement }) =>
                current.replace(pattern, replacement),
              text.replace(pattern, (name) => names[name])
            );

          return [
            row.name,
            createTool({
              id: row.name,
              description: row.description,
              inputSchema: withDescriptions(src.inputSchema, row.input),
              outputSchema: withDescriptions(src.outputSchema, row.output),
              mcp: {
                annotations: { title: row.title, ...row.annotations },
                _meta: { ...src.mcp?._meta, ...row.meta },
              },
              execute: async (input: any, context: any) => {
                try {
                  return rewriteStrings(
                    await src.execute(input, context),
                    rewrite
                  );
                } catch (error) {
                  if (error instanceof Error) {
                    error.message = rewrite(error.message);
                  }
                  throw error;
                }
              },
            } as any),
          ];
        })
    );
  }
}
