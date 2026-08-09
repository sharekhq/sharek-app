import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';

/**
 * The globally registered {@link ThrottlerBehindProxyGuard} answers `true` for
 * every route except `POST /public/v1/posts`, so a `@Throttle` decorator on its
 * own is never consulted anywhere else. Routes that genuinely need a limit carry
 * this guard, which does not short-circuit.
 *
 * Tracking is by organisation, matching FR-015 — the limit is on a workspace,
 * not on whichever address it happened to submit from.
 */
@Injectable()
export class SupportThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    return req.org.id;
  }
}
