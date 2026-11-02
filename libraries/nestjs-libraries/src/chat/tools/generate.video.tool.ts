import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
                    Generating takes minutes, so this only starts the render and returns a jobId (or { error } when the video credits are exhausted or the video type is not available during the trial).
                    Tell the user the video is rendering and will appear in their Media library, then end your reply —
                    never wait, poll or call 'videoStatusTool' in the same turn; call it only when the user asks about the video later.
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
        jobId: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse((context?.requestContext as any)?.get('organization') as string);

        try {
          const value = await this._mediaService.startGenerateVideo(org, {
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
            jobId: value.jobId,
          };
        } catch (err) {
          // Handed back as data rather than thrown: a throw reaches the model
          // as an opaque failure and it supplies a cause of its own — the
          // reported "your subscription doesn't include access to video
          // generation", about a plan that does include it. Told this, the
          // model refuses in the conversation's own language.
          //
          // No upsell: the ChatGPT plugin guidelines forbid one, and Samy reads
          // the same text. A FREE or lapsed organization has no credit window,
          // so its refusal carries no reset date.
          if (err instanceof SubscriptionException) {
            const { resetsAt } = err.getResponse() as { resetsAt?: string };
            return {
              error: resetsAt
                ? `The monthly AI video credits for this organization are used up, so no video was generated. Tell the user their AI video credits have run out — not that their plan or subscription lacks video generation, which it does not — and that they reset on ${resetsAt}. Every type of video draws on the same video credits; AI image credits are a separate pool. Do not suggest upgrading or buying anything.`
                : "This organization's current plan has no AI video credits, so no video was generated. Tell the user AI video generation is not available on their current plan. Do not suggest upgrading or buying anything.",
            };
          }

          // resolveVideo answers 406 only for a video type a trialing org can't
          // use, and its text links to a page that charges the plan at once.
          if (
            err instanceof HttpException &&
            err.getStatus() === HttpStatus.NOT_ACCEPTABLE
          ) {
            return {
              error:
                'This type of video is not available during the trial, so no video was generated. Tell the user it becomes available when their trial ends. Do not suggest ending the trial early, upgrading or buying anything.',
            };
          }

          throw err;
        }
      },
    });
  }
}
