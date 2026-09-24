import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { User } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
  ServerEvent,
  EventRequest,
  UserData,
  CustomData,
  FacebookAdsApi,
} from 'facebook-nodejs-business-sdk';
import { createHash } from 'crypto';
import { PostHog } from 'posthog-node';

const access_token = process.env.FACEBOOK_PIXEL_ACCESS_TOKEN!;
const pixel_id = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL!;

if (access_token && pixel_id) {
  FacebookAdsApi.init(access_token || '');
}

export type LifecycleEvent =
  | 'signed_up'
  | 'activated'
  | 'trial_started'
  | 'subscription_activated'
  | 'payment_succeeded'
  | 'subscription_cancelled';

@Injectable()
export class TrackService {
  // Built on first use rather than at module scope, so the PostHog variables
  // are read when an event is sent.
  private _posthog?: PostHog;

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  track(
    uniqueId: string,
    ip: string,
    agent: string,
    tt: TrackEnum,
    additional: Record<string, any>,
    fbclid?: string,
    user?: User
  ) {
    if (!access_token || !pixel_id) {
      return;
    }
    // @ts-ignore
    const current_timestamp = Math.floor(new Date() / 1000);

    const userData = new UserData();
    if (ip || user?.ip) {
      userData.setClientIpAddress(ip || user?.ip || '');
    }

    if (agent || user?.agent) {
      userData.setClientUserAgent(agent || user?.agent || '');
    }
    if (fbclid) {
      userData.setFbc(fbclid);
    }

    if (user && user.email) {
      userData.setEmail(this.hashValue(user.email));
    }

    let customData = null;
    if (additional?.value) {
      customData = new CustomData();
      customData.setValue(additional.value).setCurrency('USD');
    }

    const serverEvent = new ServerEvent()
      .setEventName(TrackEnum[tt])
      .setEventTime(current_timestamp)
      .setActionSource('website');

    if (user && user.id) {
      serverEvent.setEventId(uniqueId || user.id);
    }

    if (userData) {
      serverEvent.setUserData(userData);
    }
    if (customData) {
      serverEvent.setCustomData(customData);
    }

    const eventsData = [serverEvent];
    const eventRequest = new EventRequest(access_token, pixel_id).setEvents(
      eventsData
    );

    return eventRequest.execute();
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
