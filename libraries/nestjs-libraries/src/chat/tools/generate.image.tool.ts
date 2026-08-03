import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { SubscriptionException } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class GenerateImageTool implements AgentToolInterface {
  private storage = UploadFactory.createStorage();

  constructor(private _mediaService: MediaService) {}
  name = 'generateImageTool';

  run() {
    return createTool({
      id: 'generateImageTool',
      description: `Generate image to use in a post,
                    in case the user specified a platform that requires attachment and attachment was not provided,
                    ask if they want to generate a picture of a video.
                    Returns the hosted media { id, path } to use as an attachment, or { error } when the image allowance is exhausted.
      `,
      mcp: {
        annotations: {
          title: 'Generate Image',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      inputSchema: z.object({
        prompt: z.string(),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape — optional fields rather than an
      // `output` union, as uploadFromUrlTool does for the same reason.
      outputSchema: z.object({
        id: z.string().optional(),
        path: z.string().optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const org = JSON.parse((context?.requestContext as any)?.get('organization') as string);

        try {
          const image = await this._mediaService.generateImage(
            inputData.prompt,
            org
          );

          const file = await this.storage.uploadSimple(
            'data:image/png;base64,' + image
          );

          return this._mediaService.saveFile(
            org.id,
            file.split('/').pop(),
            file
          );
        } catch (err) {
          // Handed back as data rather than thrown: a throw reaches the user as
          // raw error text, and a turn that ends without content poisons the
          // thread. Told this, the model refuses in the conversation's own
          // language.
          if (err instanceof SubscriptionException) {
            return {
              error:
                'The monthly AI image allowance for this organization is used up, so no image was generated. Tell the user their AI image credits have run out, and that they can upgrade their plan or wait for the allowance to reset next month.',
            };
          }

          throw err;
        }
      },
    });
  }
}
