import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { TavilyService } from '@gitroom/nestjs-libraries/tavily/tavily.service';
import { takeWebLookup } from '@gitroom/nestjs-libraries/chat/tools/read.web.page.tool';

/**
 * Samy's `webSearchTool`, which LoadToolsService adds for its runs only. It
 * stays out of `toolList`, because that is what every outside connection lists.
 */
@Injectable()
export class WebSearchTool implements AgentToolInterface {
  constructor(private _tavilyService: TavilyService) {}
  name = 'webSearchTool';

  available() {
    return !!process.env.TAVILY_API_KEY;
  }

  run() {
    return createTool({
      id: 'webSearchTool',
      description:
        "Search the web. Returns up to 5 results, each { title, url, snippet }, or { error } when the search couldn't be made. Each call is one of the message's web lookups.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .max(400)
          .describe("What to search for, in the user's language."),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape, as the image tools' do.
      outputSchema: z.object({
        results: z
          .array(
            z.object({
              title: z.string(),
              url: z.string(),
              snippet: z.string(),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        const run = context?.requestContext as any;

        // One count with readWebPageTool, so a message can't make 5 of each.
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
            results: await this._tavilyService.search(org.id, inputData.query),
          };
        } catch (err) {
          // The service's failures are already written for the model to relay.
          if (err instanceof HttpException) {
            return { error: err.message };
          }

          console.error('webSearchTool failed:', err);
          return {
            error:
              "The web lookup failed. Say it failed and offer to try again; don't answer from memory as if you had read it.",
          };
        }
      },
    });
  }
}
