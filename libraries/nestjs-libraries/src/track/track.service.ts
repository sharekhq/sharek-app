import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { User } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PostHog } from 'posthog-node';
import { META_GRAPH_API_VERSION } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';

export type LifecycleEvent =
  | 'signed_up'
  | 'activated'
  | 'trial_started'
  | 'subscription_activated'
  | 'payment_succeeded'
  | 'subscription_cancelled';

// The Conversions API is called directly instead of through
// facebook-nodejs-business-sdk: the SDK registers a process wide
// uncaughtException handler on first use that re-throws every error of the
// app (killing the process before Sentry reports it), and its requests have
// no timeout.
@Injectable()
export class TrackService {
  // Built on first use rather than at module scope, so the PostHog variables
  // are read when an event is sent.
  private _posthog?: PostHog;

  private hashValue(value: string) {
    return createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  // A _fbc cookie is sent as is, a bare fbclid has to be wrapped as
  // fb.<subdomainIndex>.<creationTime ms>.<fbclid> (index 1 when built on a server)
  private toFbc(fbc: string) {
    return fbc.startsWith('fb.') ? fbc : `fb.1.${Date.now()}.${fbc}`;
  }

  // Never throws and never rejects: a pixel failure (bad token, Meta outage,
  // timeout) must not break the request or the webhook that fired it, so
  // callers fire it in the background.
  async track(
    uniqueId: string,
    ip: string,
    agent: string,
    tt: TrackEnum,
    additional: Record<string, any>,
    fbc?: string,
    user?: User,
    fbp?: string
  ) {
    const accessToken = process.env.FACEBOOK_PIXEL_ACCESS_TOKEN;
    const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL;
    const userAgent = agent || user?.agent;
    // website events are rejected without a user agent
    if (!accessToken || !pixelId || !userAgent) {
      return;
    }

    try {
      const clientIp = ip || user?.ip;
      const response = await fetch(
        `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${pixelId}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: accessToken,
            data: [
              {
                event_name: TrackEnum[tt],
                event_time: Math.floor(Date.now() / 1000),
                event_id: uniqueId || user?.id,
                event_source_url: process.env.FRONTEND_URL,
                action_source: 'website',
                user_data: {
                  client_user_agent: userAgent,
                  ...(clientIp ? { client_ip_address: clientIp } : {}),
                  ...(user?.email?.includes('@')
                    ? { em: [this.hashValue(user.email)] }
                    : {}),
                  ...(fbc ? { fbc: this.toFbc(fbc) } : {}),
                  ...(fbp ? { fbp } : {}),
                },
                ...(additional?.value
                  ? {
                      custom_data: {
                        value: additional.value,
                        currency: (additional.currency || 'USD').toUpperCase(),
                      },
                    }
                  : {}),
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        console.error(
          `Facebook pixel rejected ${TrackEnum[tt]}:`,
          await response.text()
        );
        return;
      }

      await response.body?.cancel();
    } catch (err) {
      console.error(`Facebook pixel failed to send ${TrackEnum[tt]}:`, err);
    }
  }

  // Records a lifecycle event in PostHog. Never throws and returns nothing to
  // await: callers make it the step after their database call.
  capture(
    distinctId: string,
    event: LifecycleEvent,
    properties: Record<string, unknown> = {}
  ): void {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key || !host) {
      return;
    }
    try {
      if (!this._posthog) {
        this._posthog = new PostHog(key, { host, flushAt: 1 });
        this._posthog.on('error', () => {});
      }
      this._posthog.capture({ distinctId, event, properties });
    } catch {}
  }
}
