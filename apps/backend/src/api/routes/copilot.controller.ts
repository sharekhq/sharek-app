import {
  Logger,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import {
  CopilotRuntime,
  copilotRuntimeNodeHttpEndpoint,
} from '@copilotkit/runtime';
import { BuiltInAgent } from '@copilotkit/runtime/v2';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import {
  getSharekAgents,
  logRunError,
} from '@gitroom/nestjs-libraries/chat/sharek.agent';
import { MastraService } from '@gitroom/nestjs-libraries/chat/mastra.service';
import { ChatThreadsService } from '@gitroom/nestjs-libraries/chat/chat.threads.service';
import { ChatTitleDto } from '@gitroom/nestjs-libraries/dtos/chat/chat.title.dto';
import { ChatPinDto } from '@gitroom/nestjs-libraries/dtos/chat/chat.pin.dto';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brands/brand.service';
import { Request, Response } from 'express';
import { RequestContext } from '@mastra/core/di';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { AuthorizationActions, Sections } from '@gitroom/backend/services/auth/permissions/permission.exception.class';

export type ChannelsContext = {
  // The selected channels as the browser sent them through CopilotKit
  // `properties`, which arrive in the run's forwardedProps; the agent's
  // instructions render them and validate the shape.
  integrations: unknown[];
  // The interface language as an i18next code, straight from the browser.
  language: string;
  // The brand chip's choice: none, each or a live brand id of the
  // organization, checked here; unset for anything else.
  brand?: string;
  organization: string;
  ui: string;
};

// the copilot runtime writes its own CORS headers on the response, keep them aligned with main.ts
const copilotCors = () => ({
  origin: [
    process.env.FRONTEND_URL,
    'http://localhost:6274',
    ...(process.env.MAIN_URL ? [process.env.MAIN_URL] : []),
  ],
  credentials: !process.env.NOT_SECURED,
});

const COMPOSER_PROMPT =
  "You are the AI Assistant in Sharek's post editor and help the user write and schedule social media posts. Write post content into the editor by calling setPosts, with one string per post: several strings make a thread.";

@Controller('/copilot')
export class CopilotController {
  constructor(
    private _subscriptionService: SubscriptionService,
    private _mastraService: MastraService,
    private _chatThreadsService: ChatThreadsService,
    private _brandService: BrandService
  ) {}
  @Post('/chat')
  chatAgent(@Req() req: Request, @Res() res: Response) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return;
    }

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/chat',
      cors: copilotCors(),
      runtime: new CopilotRuntime({
        agents: {
          default: new BuiltInAgent({
            model: 'openai/gpt-5.6-luna',
            apiKey: process.env.OPENAI_API_KEY,
            providerOptions: { openai: { reasoningEffort: 'none' } },
            prompt: COMPOSER_PROMPT,
          }),
        },
      }),
    });

    return copilotRuntimeHandler(req, res);
  }

  @Post('/agent')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async agent(
    @Req() req: Request,
    @Res() res: Response,
    @GetOrgFromRequest() organization: Organization
  ) {
    if (
      process.env.OPENAI_API_KEY === undefined ||
      process.env.OPENAI_API_KEY === ''
    ) {
      Logger.warn('OpenAI API key not set, chat functionality will not work');
      return;
    }
    const mastra = await this._mastraService.mastra();
    const requestContext = new RequestContext<ChannelsContext>();
    const forwardedProps = req?.body?.body?.forwardedProps;
    requestContext.set('integrations', forwardedProps?.integrations || []);

    // The interface language, which the agent's instructions name outright
    // rather than leave the model to infer. Same untrusted browser payload as
    // the channels above: the prompt validates it and falls back on its own.
    requestContext.set('language', forwardedProps?.language || '');

    // The brand chip's choice, which the image tool follows before the
    // channels (R14), so unlike the payload above it is checked here. Only a
    // string is looked up, as an object would reach Prisma as a filter, and a
    // failed check drops the brand rather than the chat.
    const brand = forwardedProps?.brand;
    if (brand === 'none' || brand === 'each') {
      requestContext.set('brand', brand);
    } else if (typeof brand === 'string') {
      try {
        if (await this._brandService.isLive(organization.id, brand)) {
          requestContext.set('brand', brand);
        }
      } catch (err) {
        Logger.warn(
          `Could not check the chat's brand for ${organization.id}: ${err}`
        );
      }
    }

    requestContext.set('organization', JSON.stringify(organization));
    requestContext.set('ui', 'true');

    // Same shape as MastraAgent.getLocalAgents, but the agents forward only the
    // newest exchange instead of the whole thread the browser resends.
    const agents = getSharekAgents({
      resourceId: organization.id,
      mastra,
      requestContext: requestContext as any,
    });

    const runtime = new CopilotRuntime({
      agents,
      // The chat shows nothing when a run fails; this logs it.
      onError: (event) => logRunError(event, organization.id),
    });

    const copilotRuntimeHandler = copilotRuntimeNodeHttpEndpoint({
      endpoint: '/copilot/agent',
      cors: copilotCors(),
      runtime,
    });

    return copilotRuntimeHandler(req, res);
  }

  @Get('/credits')
  calculateCredits(
    @GetOrgFromRequest() organization: Organization,
    @Query('type')
    type: 'ai_images' | 'ai_videos' | 'clipping_minutes'
  ) {
    return this._subscriptionService.checkCredits(
      organization,
      type || 'ai_images'
    );
  }

  @Get('/:thread/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getMessagesList(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string
  ): Promise<any> {
    const mastra = await this._mastraService.mastra();
    const memory = await mastra.getAgent('postiz').getMemory();
    try {
      return await memory.recall({
        resourceId: organization.id,
        threadId,
        // The whole thread, oldest first. Without perPage, recall() would stop at
        // the agent's lastMessages window (load.tools.service.ts).
        perPage: false,
      });
    } catch (err) {
      Logger.warn(`Could not recall messages for thread ${threadId}: ${err}`);
      return { messages: [] };
    }
  }

  @Get('/list')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async getList(@GetOrgFromRequest() organization: Organization) {
    return this._chatThreadsService.list(organization.id);
  }

  @Put('/:thread/title')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async renameThread(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string,
    @Body() body: ChatTitleDto
  ) {
    return this._chatThreadsService.rename(
      organization.id,
      threadId,
      body.title
    );
  }

  @Put('/:thread/pin')
  @CheckPolicies([AuthorizationActions.Create, Sections.AI])
  async pinThread(
    @GetOrgFromRequest() organization: Organization,
    @Param('thread') threadId: string,
    @Body() body: ChatPinDto
  ) {
    return this._chatThreadsService.setPinned(
      organization.id,
      threadId,
      body.pinned
    );
  }
}
