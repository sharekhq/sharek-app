import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Organization, User } from '@prisma/client';
import dayjs from 'dayjs';
import { isSupportConfigured } from '@gitroom/helpers/utils/is.support.configured';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { CreateSupportTicketDto } from '@gitroom/nestjs-libraries/dtos/support/create.support.ticket.dto';
import { SupportService } from '@gitroom/nestjs-libraries/services/support.service';
import { SupportThrottlerGuard } from '@gitroom/nestjs-libraries/throttler/support.throttler.guard';

@ApiTags('Support')
@Controller('/support')
export class SupportController {
  constructor(private _supportService: SupportService) {}

  // 90/hour is right for the API at large and far too loose for a support form.
  // The guard is explicit because the global one skips every route but one.
  @Post('/')
  @UseGuards(SupportThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  async createTicket(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization,
    @Req() req: Request,
    @Body() body: CreateSupportTicketDto
  ) {
    // Unreachable through the UI, where the entry and the page are both hidden.
    // This is what a direct call meets — a plain answer, rather than the service
    // dialling a host assembled out of `undefined` and reporting the help desk
    // as unavailable when it was never configured.
    if (!isSupportConfigured()) {
      throw new HttpException(
        'Support is not configured on this deployment',
        HttpStatus.BAD_REQUEST
      );
    }

    const ticketNumber = await this._supportService.createTicket(
      {
        userId: user.id,
        name: user.name,
        email: user.email,
        organizationId: organization.id,
        organizationName: organization.name,
        // @ts-ignore the active membership, not the account — the same person is
        // ADMIN in one organisation and USER in another (research R11)
        role: organization?.users?.[0]?.role,
        // @ts-ignore
        tier: organization?.subscription?.subscriptionTier || 'FREE',
        // @ts-ignore
        isLifetime: !!organization?.subscription?.isLifetime,
        isTrailing: !!organization?.isTrailing,
        accountAgeDays: dayjs().diff(dayjs(user.createdAt), 'day'),
        isImpersonating: !!(
          req.cookies?.impersonate || req.headers?.impersonate
        ),
      },
      body
    );

    return { ticketNumber };
  }
}
