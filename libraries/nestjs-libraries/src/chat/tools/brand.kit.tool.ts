import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { selectedChannels } from '@gitroom/nestjs-libraries/chat/selected.channels';

/**
 * Samy's `brandKitTool`, which LoadToolsService adds for its runs only. It
 * stays out of `toolList`, because that is what every outside connection lists.
 * It makes nothing and reads no credit: SamyImageReader shows its logo and
 * example posts as pictures, in that turn only (FR-009).
 */
@Injectable()
export class BrandKitTool implements AgentToolInterface {
  constructor(private _brandService: BrandService) {}
  name = 'brandKitTool';

  run() {
    return createTool({
      id: 'brandKitTool',
      description:
        "Look at a brand's kit, for no credit. Its logo and example posts reach you as pictures after this result, in this turn only. When asked for an image for a brand that has example posts, or about the brand's look, call it first. Returns { brand, logo, examples: [{ n, path }], colours, headingFont, bodyFont, details }, or { error }.",
      inputSchema: z.object({
        brand: z
          .string()
          .optional()
          .describe("A brand's name. Leave it out for the brand in use."),
      }),
      // Mastra validates a tool's return against this schema, so it must also
      // allow the graceful { error } shape, as the image tools' do.
      outputSchema: z.object({
        brand: z.string().optional(),
        // A path, only while the logo is in Media
        logo: z.string().optional(),
        examples: z
          .array(z.object({ n: z.number(), path: z.string() }))
          .optional(),
        colours: z.array(z.string()).optional(),
        headingFont: z.string().optional(),
        bodyFont: z.string().optional(),
        details: z
          .object({
            about: z.string().optional(),
            toneOfVoice: z.string().optional(),
            postLanguage: z.string().optional(),
            callToAction: z.string().optional(),
            hashtags: z.string().optional(),
          })
          .optional(),
        error: z.string().optional(),
      }),
      execute: async (inputData, context) => {
        const run = context?.requestContext as any;

        // Every failure is handed back as data: a throw reaches the user as raw
        // error text, and a turn that ends without content poisons the thread.
        try {
          checkAuth(inputData, context);
          const org = JSON.parse(run?.get('organization') as string);

          // Picked as Samy's image tool picks it: the brand chip's choice as
          // the copilot controller kept it, and only the channels' ids
          // (research R7).
          const summary = await this._brandService.summaryForSamy(org.id, {
            chip: run?.get('brand'),
            input: inputData.brand,
            channelIds: selectedChannels(run?.get('integrations')).map(
              (channel) => channel.id
            ),
          });
          if ('none' in summary) {
            return {
              error:
                "No brand is in use, so there's no kit to look at. Say so, and tell the user they can pick a brand on the brand chip or set one up on the Brands page.",
            };
          }
          if ('several' in summary) {
            const names = summary.several.join(', ');
            return {
              error: `The selected channels belong to ${summary.several.length} brands: ${names}. Call again with brand set to the one you're working on.`,
            };
          }
          if ('ask' in summary) {
            const names = summary.ask.join(', ');
            return {
              error: `This workspace has ${summary.ask.length} brands: ${names}. Ask the user which brand, or none, then call again with its name.`,
            };
          }
          if ('unknown' in summary) {
            const names = summary.brands.join(', ');
            return {
              error: `There's no brand called "${summary.unknown}". The brands are: ${names}. Ask the user which one, or none.`,
            };
          }

          const { name, logo, ...kit } = summary;
          return { brand: name, logo: logo?.path, ...kit };
        } catch (err) {
          console.error('brandKitTool failed:', err);
          return {
            error:
              "The brand's kit couldn't be read. Say the step failed and offer to try again.",
          };
        }
      },
    });
  }
}
