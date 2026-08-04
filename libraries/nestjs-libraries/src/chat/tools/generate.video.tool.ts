import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import {
  IntegrationManager,
  socialIntegrationList,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class GenerateVideoTool implements AgentToolInterface {
  constructor(
    private _mediaService: MediaService,
    private _videoManager: VideoManager
  ) {}
  name = 'generateVideoTool';

  run() {
    return createTool({
      id: 'generateVideoTool',
      mcp: {
        annotations: {
          title: 'Generate Video',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      description: `Generate video to use in a post,
                    in case the user specified a platform that requires attachment and attachment was not provided,
                    ask if they want to generate a picture of a video.
                    In many cases 'videoFunctionTool' will need to be called first, to get things like voice id
                    Returns the generated video { url }, or { error } when the video credits are exhausted.
                    Here are the type of video that can be generated:
                    ${this._videoManager
                      .getAllVideos()
                      .map((p) => "-" + p.title)
                      .join('\n')}
      `,
      inputSchema: z.object({
        identifier: z.string(),
        output: z.enum(['vertical', 'horizontal']),
        customParams: z.array(
          z.object({
            key: z.string().describe('Name of the settings key to pass'),
            value: z.any().describe('Value of the key'),
          })
        ),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape — optional fields rather than an
      // `output` union, as generateImageTool already does for the same reason.
      outputSchema: z.object({
        url: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse((context?.requestContext as any)?.get('organization') as string);

        try {
          const value = await this._mediaService.generateVideo(org, {
            type: inputData.identifier,
            output: inputData.output,
            customParams: inputData.customParams.reduce(
              (all: Record<string, any>, current: { key: string; value: any }) => ({
                ...all,
                [current.key]: current.value,
              }),
              {} as Record<string, any>
            ),
          });

          return {
            url: value.path,
          };
        } catch (err) {
          // Handed back as data rather than thrown: a throw reaches the model
          // as an opaque failure and it supplies a cause of its own — the
          // reported "your subscription doesn't include access to video
          // generation", about a plan that does include it. Told this, the
          // model refuses in the conversation's own language.
          if (err instanceof SubscriptionException) {
            return {
              error:
                'The monthly AI video credits for this organization are used up, so no video was generated. Tell the user their AI video credits have run out — not that their plan or subscription lacks video generation, which it does not. They can upgrade their plan or wait for their credits to reset next month. Every type of video draws on the same video credits; AI image credits are a separate pool.',
            };
          }

          throw err;
        }
      },
    });
  }
}
