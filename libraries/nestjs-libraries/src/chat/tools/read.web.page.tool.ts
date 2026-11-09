import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { TavilyService } from '@gitroom/nestjs-libraries/tavily/tavily.service';

export const WEB_LOOKUPS_PER_MESSAGE = 5;

// On the run's request context, which every call in one reply shares, and
// counted by both web tools.
export const WEB_LOOKUPS_MADE = 'samyWebLookupsMade';

// Read and raised before anything awaits, because a step's parallel calls all
// start together. Each POST builds a new context, so a regenerate starts again.
// A call that then fails keeps its slot, since Tavily may have billed it.
export const takeWebLookup = (run: any): string | undefined => {
  const lookupsMade: number = run?.get(WEB_LOOKUPS_MADE) ?? 0;
  if (lookupsMade >= WEB_LOOKUPS_PER_MESSAGE) {
    return `One message can make up to ${WEB_LOOKUPS_PER_MESSAGE} web lookups, so this one wasn't made. Tell the user what you found so far and that you can look further if they ask.`;
  }
  run?.set(WEB_LOOKUPS_MADE, lookupsMade + 1);
  return undefined;
};

/**
 * Samy's `readWebPageTool`, which LoadToolsService adds for its runs only. It
 * stays out of `toolList`, because that is what every outside connection lists.
 */
@Injectable()
export class ReadWebPageTool implements AgentToolInterface {
  constructor(private _tavilyService: TavilyService) {}
  name = 'readWebPageTool';

  available() {
    return !!process.env.TAVILY_API_KEY;
  }

  run() {
    return createTool({
      id: 'readWebPageTool',
      description:
        "Read the words of up to 3 public web pages. Returns { pages }, each { url, text } or { url, error }, or { error } when nothing could be read. Text past 8,000 characters is cut, and ends with a note saying so. Pages that need a login, such as Facebook or Instagram, can't be read. Each call is one of the message's web lookups.",
      inputSchema: z.object({
        urls: z
          .array(
            z
              .string()
              .url()
              .regex(/^https?:\/\//)
          )
          .min(1)
          .max(3)
          .describe('Each an absolute http/https URL.'),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape, as the image tools' do.
      outputSchema: z.object({
        pages: z
          .array(
            z.object({
              url: z.string(),
              text: z.string().optional(),
              error: z.string().optional(),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        const run = context?.requestContext as any;

        const refusal = takeWebLookup(run);
        if (refusal) {
          return { error: refusal };
        }

        // Every failure is handed back as data: a throw reaches the user as raw
        // error text, and a turn that ends without content poisons the thread.
        try {
          checkAuth(inputData, context);
          const org = JSON.parse(run?.get('organization') as string);

          return {
            pages: await this._tavilyService.extract(org.id, inputData.urls),
          };
        } catch (err) {
          // The service's failures are already written for the model to relay.
          if (err instanceof HttpException) {
            return { error: err.message };
          }

          console.error('readWebPageTool failed:', err);
          return {
            error:
              "The web lookup failed. Say it failed and offer to try again; don't answer from memory as if you had read it.",
          };
        }
      },
    });
  }
}
