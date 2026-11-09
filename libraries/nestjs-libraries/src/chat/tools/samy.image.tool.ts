import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HttpException, Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { selectedChannels } from '@gitroom/nestjs-libraries/chat/selected.channels';
import { imageCreditRefusal } from '@gitroom/nestjs-libraries/chat/tools/generate.image.tool';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  IMAGE_ASPECT_IDS,
  IMAGE_PROMPT_MAX_CHARS,
  IMAGE_REFERENCE_MAX,
  ImageAspectId,
} from '@gitroom/nestjs-libraries/dtos/media/image.generation.catalog';

const IMAGES_PER_MESSAGE = 4;

// On the run's request context, which every call in one reply shares.
const IMAGES_MADE = 'samyImagesMade';
const IMAGE_BUDGET = 'samyImageBudget';

type ImageBudget = { credits: number; resetsAt?: string };

/**
 * Samy's `generateImageTool`, which LoadToolsService swaps in for its runs only.
 * It stays out of `toolList`, because that is what every outside connection lists,
 * and OpenAI holds a changed tool until it's approved again.
 */
@Injectable()
export class SamyImageTool implements AgentToolInterface {
  constructor(
    private _mediaService: MediaService,
    private _brandService: BrandService
  ) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description:
        "Make an image and save it to the Media library, for one image credit. Returns { id, path }, with brand set to the brand's name when its kit went along, or { error } when it couldn't be made. The chat shows the image by itself.",
      inputSchema: z.object({
        // First, because the waiting card takes its shape from this as it streams.
        aspectRatio: z
          .enum(IMAGE_ASPECT_IDS as [ImageAspectId, ...ImageAspectId[]])
          .default('square')
          .describe(
            'The shape of the image. Square unless they ask for another.'
          ),
        prompt: z
          .string()
          .max(IMAGE_PROMPT_MAX_CHARS)
          .describe(
            "The user's description in their own words. Words to print stay as they wrote them."
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
        brand: z
          .string()
          .optional()
          .describe(
            "A brand's name, to use its kit, or 'none' for no brand. Leave it out to use the brand of the selected channels."
          ),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape, as GenerateImageTool's does.
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        error: z.string().optional(),
        // Only when part of the brand's kit went along, so Samy can name it
        brand: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        const run = context?.requestContext as any;

        // Read and raised before anything awaits, because a step's parallel calls
        // all start together. Each POST builds a new context, so a regenerate
        // starts again.
        const imagesMade: number = run?.get(IMAGES_MADE) ?? 0;
        if (imagesMade >= IMAGES_PER_MESSAGE) {
          return {
            error: `One message can make up to ${IMAGES_PER_MESSAGE} images, so this one wasn't made and no credit was spent. Tell the user you can make up to ${IMAGES_PER_MESSAGE} at a time.`,
          };
        }
        run?.set(IMAGES_MADE, imagesMade + 1);

        const giveSlotBack = () =>
          run?.set(IMAGES_MADE, run.get(IMAGES_MADE) - 1);
        let creditFrom: ImageBudget | undefined;

        // Every failure is handed back as data: a throw reaches the user as raw
        // error text, and a turn that ends without content poisons the thread.
        try {
          checkAuth(inputData, context);
          const org = JSON.parse(run?.get('organization') as string);

          // A brand that can't be picked makes no image, and no credit is read.
          // Only the channels' ids go: the brand service reads the channels
          // again, for this organization (research R9).
          const { brand, ...image } = inputData;
          const picked = await this._brandService.resolveForSamy(org.id, {
            input: brand,
            channelIds: selectedChannels(run?.get('integrations')).map(
              (channel) => channel.id
            ),
          });
          if ('error' in picked) {
            giveSlotBack();
            return { error: picked.error };
          }

          // The promise and not its answer, so parallel calls share one read. The
          // credit check inside the render can't do this: it passes all of them
          // before the first one's usage is written.
          if (!run?.get(IMAGE_BUDGET)) {
            run?.set(
              IMAGE_BUDGET,
              this._mediaService.imageCreditsLeft(org).catch((err) => {
                // A failed read stays failed if it's kept, and a later call can recover.
                run?.delete(IMAGE_BUDGET);
                throw err;
              })
            );
          }
          const budget: ImageBudget = await run?.get(IMAGE_BUDGET);
          if (budget.credits <= 0) {
            giveSlotBack();
            return { error: imageCreditRefusal(budget.resetsAt) };
          }
          budget.credits -= 1;
          creditFrom = budget;

          return await this._mediaService.generateImageFromLinks(org, {
            ...image,
            brand: picked.brandId,
          });
        } catch (err) {
          giveSlotBack();
          if (creditFrom) {
            creditFrom.credits += 1;
          }

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
