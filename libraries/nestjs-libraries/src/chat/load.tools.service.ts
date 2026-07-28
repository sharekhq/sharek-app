import { Injectable } from '@nestjs/common';
import { Agent, AgentExecutionOptions } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { pStore } from '@gitroom/nestjs-libraries/chat/mastra.store';
import { ModuleRef } from '@nestjs/core';
import { toolList } from '@gitroom/nestjs-libraries/chat/tools/tool.list';
import dayjs from 'dayjs';

const renderArray = (list: string[], show: boolean) => {
  if (!show) return '';
  return list.map((p) => `- ${p}`).join('\n');
};

type SelectedChannel = {
  id: string;
  identifier: string;
  additionalSettings?: string;
};

// The browser sends this through CopilotKit `properties`, so nothing about its
// shape is guaranteed. Keep only entries the model can actually act on, and
// never throw: instructions run on every turn, so a malformed payload here
// would fail the whole chat rather than one field.
const renderChannels = (integrations: unknown) => {
  if (!Array.isArray(integrations)) return '';
  const channels = (integrations as SelectedChannel[]).filter(
    (p) => p && typeof p.id === 'string' && typeof p.identifier === 'string'
  );
  if (!channels.length) return '';
  const lines = channels.map((p) => {
    // additionalSettings defaults to the literal '[]'; it only carries anything
    // for the few providers that have their own toggles (X's Verified).
    const settings =
      p.additionalSettings && p.additionalSettings !== '[]'
        ? `, settings: ${p.additionalSettings}`
        : '';
    return `        - ${p.identifier} (id: ${p.id}${settings})`;
  });
  return `
      Channels selected for this conversation — schedule to these unless the user names others, and use these ids:
${lines.join('\n')}
`;
};

const organizationId = (organization?: string) => {
  if (!organization) return undefined;
  try {
    return JSON.parse(organization)?.id as string | undefined;
  } catch {
    return undefined;
  }
};

@Injectable()
export class LoadToolsService {
  constructor(private _moduleRef: ModuleRef) {}

  async loadTools() {
    return (
      await Promise.all<{ name: string; tool: any }>(
        toolList
          .map((p) => this._moduleRef.get(p, { strict: false }))
          .map(async (p) => ({
            name: p.name as string,
            tool: await p.run(),
          }))
      )
    ).reduce(
      (all, current) => ({
        ...all,
        [current.name]: current.tool,
      }),
      {} as Record<string, any>
    );
  }

  async agent() {
    const tools = await this.loadTools();
    return new Agent({
      id: 'sharek',
      name: 'Sharek',
      description: 'Agent that helps manage and schedule social media posts for users',
      instructions: ({ requestContext }) => {
        const ui: string = requestContext.get('ui' as never);
        const channels = renderChannels(
          requestContext.get('integrations' as never)
        );
        return `
      Global information:
        - Date and hour (UTC), rounded down: ${dayjs().format(
          'YYYY-MM-DD HH'
        )}:00 (minutes are not shown, treat the time as approximate)
${channels}
      You are an agent that helps manage and schedule social media posts for users, you can:
        - Schedule posts into the future, or now, adding texts, images and videos
        - Generate pictures for posts
        - Generate videos for posts
        - Generate text for posts
        - Show global analytics about socials
        - List integrations (channels)
        - List groups (customers) and filter the channels by a group

      - We schedule posts to different integration like facebook, instagram, etc. but to the user we don't say integrations we say channels as integration is the technical name
      - When scheduling a post, you must follow the social media rules and best practices.
      - When scheduling a post, you can pass an array for list of posts for a social media platform, But it has different behavior depending on the platform.
        - For platforms like Threads, Bluesky and X (Twitter), each post in the array will be a separate post in the thread.
        - For platforms like LinkedIn and Facebook, second part of the array will be added as "comments" to the first post.
        - If the social media platform has the concept of "threads", we need to ask the user if they want to create a thread or one long post.
        - For X, if you don't have Premium, don't suggest a long post because it won't work.
        - Platform format will also be passed can be "normal", "markdown", "html", make sure you use the correct format for each platform.
      
      - Sometimes 'integrationSchema' will return rules, make sure you follow them (these rules are set in stone, even if the user asks to ignore them)
      - Each socials media platform has different settings and rules, you can get them by using the integrationSchema tool.
      - Always make sure you use this tool before you schedule any post.
      - The channels listed above are the ones selected right now, and the list is refreshed every turn — always prefer it over channel ids mentioned earlier in the conversation.
      - For a channel's rules and settings, use the integrationSchema tool.
      - Before scheduling a post, always make sure you ask the user confirmation by providing all the details of the post (text, images, videos, date, time, social media platform, account).
      - Between tools, we will reference things like: [output:name] and [input:name] to set the information right.
      - When outputting a date for the user, make sure it's human readable with time
      - The content of the post, HTML, Each line must be wrapped in <p> here is the possible tags: h1, h2, h3, u, strong, li, ul, p (you can\'t have u and strong together), don't use a "code" box
      ${renderArray(
        [
          'If the user confirm, ask if they would like to get a modal with populated content without scheduling the post yet or if they want to schedule it right away.',
        ],
        !!ui
      )}
`;
      },
      model: openai('gpt-5.2'),
      defaultOptions: ({ requestContext }) => {
        // Requests from one organization share a byte-identical prefix (system
        // prompt + tool schemas), so key the cache by organization to route
        // them to the machine already holding it. Absent on the MCP path,
        // where `organization` only lands during tool execution.
        const id = organizationId(
          requestContext.get('organization' as never) as string | undefined
        );
        // Mastra types defaultOptions as AgentExecutionOptions<TOutput>, which
        // makes `structuredOutput` required whenever `TOutput extends {}`. The
        // repo compiles with strictNullChecks off, where `undefined extends {}`
        // is true, so the branch demanding it is selected even though this agent
        // has no structured output. Asserting the shape keeps that off the
        // runtime object — setting structuredOutput: undefined would not.
        return {
          providerOptions: {
            openai: {
              // gpt-5.2 bills reasoning tokens as output ($14/M against $1.75/M
              // for input). 'none' is its documented default already, so this
              // changes nothing today — it just stops a provider default from
              // moving the bill without us noticing.
              reasoningEffort: 'none',
              ...(id ? { promptCacheKey: `sharek-agent-${id}` } : {}),
            },
          },
        } as AgentExecutionOptions<undefined>;
      },
      tools,
      memory: new Memory({
        storage: pStore,
        options: {
          generateTitle: true,
          // CopilotKit resends the entire thread on every turn, so this window
          // is history the model already has. Mastra would dedupe it, but only
          // by message id, and @ag-ui/mastra drops the ids. 1 is the smallest
          // value that still persists messages — 0 and false write nothing.
          // Callers of memory.recall() must pass perPage: it defaults to this.
          lastMessages: 1,
        },
      }),
    });
  }
}
