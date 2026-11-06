import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { imageCreditRefusal } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_PROMPT_MAX_CHARS,
  IMAGE_REFERENCE_MAX,
  ImageAspectId,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

/**
 * Samy's `generateImageTool`, which LoadToolsService swaps in for its runs only.
 * It stays out of `toolList`, because that is what every outside connection lists,
 * and OpenAI holds a changed tool until it's approved again.
 */
@Injectable()
export class SamyImageTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description:
        "Make an image and save it to the Media library, for one image credit. Returns { id, path }, or { error } when it couldn't be made. The chat shows the image by itself.",
      inputSchema: z.object({
        prompt: z
          .string()
          .max(IMAGE_PROMPT_MAX_CHARS)
          .describe(
            "The user's description in their own words. Words to print stay as they wrote them."
          ),
        aspectRatio: z
          .enum(IMAGE_ASPECT_IDS as [ImageAspectId, ...ImageAspectId[]])
          .default('square')
          .describe(
            'The shape of the image. Square unless they ask for another.'
          ),
        references: z
          .array(z.string())
          .max(IMAGE_REFERENCE_MAX)
          .optional()
          .describe(
            `Links of images attached or made in this chat, at most ${IMAGE_REFERENCE_MAX}.`
          ),
        editOf: z
          .string()
          .optional()
          .describe(
            `Link of the image being changed. With it, references may hold at most ${
              IMAGE_REFERENCE_MAX - 1
            }.`
          ),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape, as GenerateImageTool's does.
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        // Every failure is handed back as data: a throw reaches the user as raw
        // error text, and a turn that ends without content poisons the thread.
        try {
          checkAuth(inputData, context);
          const org = JSON.parse(
            (context?.requestContext as any)?.get('organization') as string
          );

          return await this._mediaService.generateImageFromLinks(
            org,
            inputData
          );
        } catch (err) {
          if (err instanceof SubscriptionException) {
            const { resetsAt } = err.getResponse() as { resetsAt?: string };
            return { error: imageCreditRefusal(resetsAt) };
          }

          // A refused reference, or generationError's words for the user.
          if (err instanceof HttpException) {
            return { error: err.message };
          }

          console.error('samyImageTool failed:', err);
          return {
            error:
              "The image couldn't be made and no credit was spent. Say the step failed and offer to try again.",
          };
        }
      },
    });
  }
}
