import {
  AgentToolInterface,
} from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class GenerateVideoOptionsTool implements AgentToolInterface {
  constructor(private _videoManagerService: VideoManager) {}
  name = 'generateVideoOptions';

  run() {
    return createTool({
      id: 'generateVideoOptions',
      description: `All the options to generate videos, some tools might require another call to generateVideoFunction. Each option carries a title and a description saying what it actually produces and what it suits — read them before choosing, and tell the user which one you picked and why`,
      inputSchema: z.object({
        reasoning: z
          .string()
          .optional()
          .describe(
            'Optional short reason for why you are listing the video generation options'
          ),
      }),
      mcp: {
        annotations: {
          title: 'List Video Generation Options',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        video: z.array(
          z.object({
            type: z.string(),
            title: z.string(),
            description: z.string(),
            output: z.string(),
            tools: z.array(
              z.object({
                functionName: z.string(),
                output: z.string(),
              })
            ),
            customParams: z.any(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        // Built once. The log and the return were two identical maps, so a
        // field added to one could silently miss the other.
        const video = this._videoManagerService.getAllVideos().map((p) => ({
          type: p.identifier,
          title: p.title,
          description: p.description,
          output: 'vertical|horizontal',
          tools: p.tools,
          customParams: getValidationSchemas()[p.dto.name],
        }));

        console.log(JSON.stringify({ video }, null, 2));

        return { video };
      },
    });
  }
}
